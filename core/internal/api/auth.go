package api

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Auth authenticates requests with the two security schemes declared in
// api/openapi.yaml: local desktop/dev requests use BearerAuth, remote
// requests through the Cloudflare Tunnel use the Cloudflare Access JWT.
// Docs/safety.md "API input": validate the Access JWT on every request.
type Auth struct {
	// BearerToken shared secret for the local desktop UI. Empty = scheme off.
	BearerToken string

	// JWT enables Cloudflare Access validation when TeamDomain is set.
	JWT JWTConfig
}

type JWTConfig struct {
	// TeamDomain, e.g. "myteam.cloudflareaccess.com".
	TeamDomain string
	// Audience is the required aud claim (Cloudflare Access AUD tag).
	Audience string
	// InsecureSkip accepts any provided JWT without verification; dev/test
	// only (the plan's "mocked/bypass key"). A real tunnel deployment must
	// not set it.
	InsecureSkip bool

	// fetchKeys is the injection hook for tests; nil = real JWKS fetcher.
	fetchKeys func(domain string) (map[string]*rsa.PublicKey, error)
}

type jwksDoc struct {
	Keys []jwk `json:"keys"`
}

type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type jwtClaims struct {
	Iss   string   `json:"iss"`
	Aud   []string `json:"aud"`
	Sub   string   `json:"sub"`
	Exp   float64  `json:"exp"`
	Email string   `json:"email"`
}

// keyCache memoizes one domain's JWKS for an hour; Cloudflare rotates keys.
type keyCache struct {
	mu        sync.Mutex
	domain    string
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

var errNoAuth = errors.New("missing authentication credentials")

// RequireAuth rejects unauthenticated requests before they reach the mux.
func (a Auth) RequireAuth(next http.Handler) http.Handler {
	var cache keyCache
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := a.authenticate(r, &cache); err != nil {
			status := http.StatusForbidden
			if errors.Is(err, errNoAuth) {
				status = http.StatusUnauthorized
			}
			writeError(w, status, "unauthorized", err.Error())
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a Auth) authenticate(r *http.Request, cache *keyCache) error {
	if tok, ok := bearerToken(r.Header.Get("Authorization")); ok {
		if a.BearerToken != "" &&
			subtle.ConstantTimeCompare([]byte(tok), []byte(a.BearerToken)) == 1 {
			return nil
		}
		return fmt.Errorf("invalid bearer token")
	}
	// Support query parameter token for media/image endpoints (e.g. <img> tags in webviews)
	if tok := strings.TrimSpace(r.URL.Query().Get("token")); tok != "" {
		if a.BearerToken != "" &&
			subtle.ConstantTimeCompare([]byte(tok), []byte(a.BearerToken)) == 1 {
			return nil
		}
		return fmt.Errorf("invalid bearer token")
	}
	assert := strings.TrimSpace(r.Header.Get("Cf-Access-Jwt-Assertion"))
	if assert == "" {
		return errNoAuth
	}
	return a.verifyAccessJWT(assert, cache)
}

func bearerToken(h string) (string, bool) {
	const prefix = "Bearer "
	if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
		return strings.TrimSpace(h[len(prefix):]), true
	}
	return "", false
}

// verifyAccessJWT validates a Cloudflare Access JWT: RS256 signature against
// the team domain's cached JWKS, then iss/aud/exp claims.
func (a Auth) verifyAccessJWT(token string, cache *keyCache) error {
	cfg := a.JWT
	if cfg.InsecureSkip {
		return nil // documented dev/test bypass
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return fmt.Errorf("malformed JWT")
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	headBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return fmt.Errorf("malformed JWT header: %w", err)
	}
	if err := json.Unmarshal(headBytes, &header); err != nil {
		return fmt.Errorf("malformed JWT header: %w", err)
	}
	if header.Alg != "RS256" {
		return fmt.Errorf("unsupported JWT alg %q", header.Alg)
	}

	keys, err := a.getKeys(cache)
	if err != nil {
		return err
	}
	key := keys[header.Kid]
	if key == nil {
		return fmt.Errorf("JWT key %q not in team JWKS", header.Kid)
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return fmt.Errorf("malformed JWT signature: %w", err)
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], sig); err != nil {
		return fmt.Errorf("JWT signature invalid")
	}

	claimBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return fmt.Errorf("malformed JWT claims: %w", err)
	}
	var claims jwtClaims
	if err := json.Unmarshal(claimBytes, &claims); err != nil {
		return fmt.Errorf("malformed JWT claims: %w", err)
	}
	wantIss := "https://" + cfg.TeamDomain
	if claims.Iss != wantIss && !strings.HasSuffix(claims.Iss, "https://"+cfg.TeamDomain) {
		return fmt.Errorf("JWT iss %q is not the team domain", claims.Iss)
	}
	if claims.Exp < float64(time.Now().Unix()) {
		return fmt.Errorf("JWT expired")
	}
	for _, aud := range claims.Aud {
		if aud == cfg.Audience {
			return nil
		}
	}
	return fmt.Errorf("JWT aud does not match the Access application")
}

// getKeys returns the team domain's signing keys, refreshing hourly.
func (a Auth) getKeys(cache *keyCache) (map[string]*rsa.PublicKey, error) {
	cfg := a.JWT
	if cfg.TeamDomain == "" {
		return nil, fmt.Errorf("cloudflare access validation is not configured")
	}
	fetch := cfg.fetchKeys
	if fetch == nil {
		fetch = fetchCloudflareKeys
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.domain == cfg.TeamDomain && cache.keys != nil &&
		time.Since(cache.fetchedAt) < time.Hour {
		return cache.keys, nil
	}
	keys, err := fetch(cfg.TeamDomain)
	if err != nil {
		return nil, fmt.Errorf("fetch team JWKS: %w", err)
	}
	cache.domain, cache.keys, cache.fetchedAt = cfg.TeamDomain, keys, time.Now()
	return keys, nil
}

// fetchCloudflareKeys downloads Cloudflare Access's public signing keys.
func fetchCloudflareKeys(domain string) (map[string]*rsa.PublicKey, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Get("https://" + domain + "/cdn-cgi/access/certs")
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS endpoint returned %d", res.StatusCode)
	}
	var doc jwksDoc
	if err := json.NewDecoder(res.Body).Decode(&doc); err != nil {
		return nil, err
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range doc.Keys {
		if k.Kty != "RSA" || k.Alg != "RS256" {
			continue
		}
		pub, err := parseJWK(k)
		if err != nil {
			continue // skip malformed entries; Cloudflare serves usable ones
		}
		keys[k.Kid] = pub
	}
	if len(keys) == 0 {
		return nil, fmt.Errorf("no RSA/RS256 keys in JWKS")
	}
	return keys, nil
}

// parseJWK turns a standard RSA JWK into an rsa.PublicKey.
func parseJWK(k jwk) (*rsa.PublicKey, error) {
	n, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		return nil, err
	}
	e, err := base64.RawURLEncoding.DecodeString(k.E)
	if err != nil {
		return nil, err
	}
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(n),
		E: int(new(big.Int).SetBytes(e).Int64()),
	}, nil
}
