package captures

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
)

func TestScanForGameShareXShadowPlayAndCustomFolders(t *testing.T) {
	tmp := t.TempDir()
	sharexDir := filepath.Join(tmp, "ShareX")
	sharexShots := filepath.Join(sharexDir, "Screenshots", "2026-11")
	shadowRoot := filepath.Join(tmp, "ShadowPlay")
	shadowGame := filepath.Join(shadowRoot, "Arknights Endfield")
	shadowDesktop := filepath.Join(shadowRoot, "Desktop")
	customDir := filepath.Join(tmp, "CustomCaptures")

	for _, dir := range []string{sharexShots, shadowGame, shadowDesktop, customDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	shotA := filepath.Join(sharexShots, "Client-Win64-Shipping_001.png")
	shotOther := filepath.Join(sharexShots, "notepad_002.png")
	clipB := filepath.Join(shadowGame, "Arknights_Endfield_Boss.mp4")
	desktopClip := filepath.Join(shadowDesktop, "Desktop_noise.mp4")
	customShot := filepath.Join(customDir, "endfield_boss_win.jpg")

	for p, body := range map[string][]byte{
		shotA:       []byte("png-data-here"),
		shotOther:   []byte("other-app"),
		clipB:       []byte("0123456789abcdefvideo"),
		desktopClip: []byte("desktop-ignored"),
		customShot:  []byte("jpeg-data"),
	} {
		if err := os.WriteFile(p, body, 0o644); err != nil {
			t.Fatal(err)
		}
	}

	// Create ShareX History.db with WindowTitle + ProcessName tags.
	histDB := filepath.Join(sharexDir, "History.db")
	db, err := sql.Open("sqlite", "file:"+histDB)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE History (Id INTEGER PRIMARY KEY, FileName TEXT, FilePath TEXT, DateTime TEXT, Type TEXT, Tags TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(
		`INSERT INTO History (FileName, FilePath, DateTime, Type, Tags) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
		"Client-Win64-Shipping_001.png", shotA, time.Now().Add(-10*time.Minute).Format("2006-01-02 15:04:05"), "Image", `{"WindowTitle":"Arknights: Endfield","ProcessName":"Endfield"}`,
		"notepad_002.png", shotOther, time.Now().Add(-5*time.Minute).Format("2006-01-02 15:04:05"), "Image", `{"WindowTitle":"Untitled - Notepad","ProcessName":"notepad"}`,
	); err != nil {
		t.Fatal(err)
	}
	db.Close()

	mgr := NewManager(filepath.Join(tmp, "state"))
	mgr.detect = func() detectedSources {
		return detectedSources{
			shareXRoot:      filepath.Join(sharexDir, "Screenshots"),
			shareXHistoryDB: histDB,
			shadowPlayRoot:  shadowRoot,
		}
	}

	prefs := (config.Preferences{CaptureFolders: []string{customDir}}).Normalized()
	aliases, err := mgr.SetAliases("999001", []string{"endfield_boss"})
	if err != nil {
		t.Fatal(err)
	}
	if len(aliases) != 1 || aliases[0] != "endfield_boss" {
		t.Fatalf("unexpected aliases: %v", aliases)
	}

	res := mgr.ScanForGame(context.Background(), prefs, GameTarget{
		AppID:      "999001",
		Name:       "Arknights: Endfield",
		InstallDir: "EndField Game",
	}, "all", "all", 50)

	if len(res.Items) != 3 {
		t.Fatalf("got %d matched captures, want 3: %+v", len(res.Items), res.Items)
	}

	// Verify opaque 32-hex IDs only (no raw paths leaked) and expected match sources.
	seenSources := map[string]string{}
	for _, it := range res.Items {
		if !isHex32(it.ID) {
			t.Errorf("invalid capture id format: %q", it.ID)
		}
		seenSources[it.Source] = it.MatchedBy
	}
	if seenSources[SourceShareX] != MatchedByShareXHistory {
		t.Errorf("ShareX matched_by = %q, want %q", seenSources[SourceShareX], MatchedByShareXHistory)
	}
	if seenSources[SourceShadowPlay] != MatchedByShadowPlayFolder {
		t.Errorf("ShadowPlay matched_by = %q, want %q", seenSources[SourceShadowPlay], MatchedByShadowPlayFolder)
	}
	if seenSources[SourceCustom] != MatchedByAlias {
		t.Errorf("Custom folder matched_by = %q, want %q", seenSources[SourceCustom], MatchedByAlias)
	}

	// Verify OpenCapture allows valid indexed capture ID and rejects unknown IDs.
	var videoID string
	for _, it := range res.Items {
		if it.Kind == KindVideo {
			videoID = it.ID
		}
	}
	f, fi, base, mime, err := mgr.OpenCapture(videoID, prefs)
	if err != nil {
		t.Fatalf("OpenCapture valid id: %v", err)
	}
	f.Close()
	if base != "Arknights_Endfield_Boss.mp4" || mime != "video/mp4" || fi.Size() != int64(len("0123456789abcdefvideo")) {
		t.Errorf("unexpected file metadata: base=%q mime=%q size=%d", base, mime, fi.Size())
	}

	// Disabling ShadowPlay immediately denies serving that ShadowPlay capture ID.
	disabled := false
	prefsNoShadow := (config.Preferences{ShadowPlayEnabled: &disabled}).Normalized()
	if _, _, _, _, err := mgr.OpenCapture(videoID, prefsNoShadow); err == nil {
		t.Errorf("expected OpenCapture to deny capture when source disabled")
	}

	if _, _, _, _, err := mgr.OpenCapture("../etc/passwd", prefs); err == nil {
		t.Errorf("expected OpenCapture to reject malformed capture ID")
	}
}

func TestShortNameDoesNotFalsePositiveMatch(t *testing.T) {
	terms := buildGameTerms(GameTarget{
		AppID:      "100",
		Name:       "ARK",
		InstallDir: "ARK",
	})
	if _, ok := matchCapture(terms, SourceShareX, "2026-11", "dark_souls_screen.png", "DARK SOULS", "DarkSoulsIII"); ok {
		t.Errorf("short game title 'ARK' must not substring-match 'DARK SOULS'")
	}
	if _, ok := matchCapture(terms, SourceShadowPlay, "ARK", "capture.mp4", "", ""); !ok {
		t.Errorf("exact folder 'ARK' should match")
	}
}
