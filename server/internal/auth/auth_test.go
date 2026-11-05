package auth_test

import (
	"testing"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/auth"
)

func TestAuthService_PasswordHashing(t *testing.T) {
	svc := auth.NewService("test-secret-123")

	password := "my-secret-password-123"
	hash, err := svc.HashPassword(password)
	if err != nil {
		t.Fatalf("unexpected hash error: %v", err)
	}

	if !svc.CheckPassword(hash, password) {
		t.Fatalf("expected password to match hash")
	}

	if svc.CheckPassword(hash, "wrong-password") {
		t.Fatalf("expected wrong password to fail")
	}
}

func TestAuthService_JWTValidation(t *testing.T) {
	svc := auth.NewService("test-secret-123")

	token, err := svc.GenerateToken("user-1", "user@example.com", "user", 1*time.Hour)
	if err != nil {
		t.Fatalf("generate token error: %v", err)
	}

	claims, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatalf("validate token error: %v", err)
	}

	if claims.UserID != "user-1" {
		t.Errorf("expected user-1, got %s", claims.UserID)
	}
	if claims.Email != "user@example.com" {
		t.Errorf("expected user@example.com, got %s", claims.Email)
	}

	// Validate with different secret fails
	diffSvc := auth.NewService("completely-different-secret")
	if _, err := diffSvc.ValidateToken(token); err == nil {
		t.Errorf("expected token validation to fail with mismatched secret")
	}
}
