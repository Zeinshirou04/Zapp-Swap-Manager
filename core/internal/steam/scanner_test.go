package steam

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("fixture %s: %v", name, err)
	}
	return data
}

func TestParseManifestValid(t *testing.T) {
	m, err := ParseManifest(fixture(t, "appmanifest_105600.acf"))
	if err != nil {
		t.Fatalf("ParseManifest: %v", err)
	}
	if m.AppID != "105600" || m.Name != "Terraria" || m.InstallDir != "Terraria" {
		t.Errorf("m = %+v", m)
	}
	if m.SizeOnDisk != 732596224 {
		t.Errorf("SizeOnDisk = %d", m.SizeOnDisk)
	}
	if m.BuildID != "12846270" {
		t.Errorf("BuildID = %q", m.BuildID)
	}
	if m.StateFlags != 4 {
		t.Errorf("StateFlags = %d", m.StateFlags)
	}
	if !m.FullyInstalled() || m.UpdatePending() {
		t.Error("expected fully installed, no update pending")
	}
}

func TestParseManifestMidUpdate(t *testing.T) {
	m, err := ParseManifest(fixture(t, "appmanifest_221380.acf"))
	if err != nil {
		t.Fatalf("ParseManifest: %v", err)
	}
	if m.StateFlags != 1026 {
		t.Errorf("StateFlags = %d", m.StateFlags)
	}
	if !m.UpdatePending() {
		t.Error("StateFlags 1026 must flag an update in flight (backup skip guard)")
	}
}

func TestParseManifestMissingAppState(t *testing.T) {
	if _, err := ParseManifest([]byte(`"Other" { }`)); err == nil {
		t.Error("expected error for file without AppState")
	}
}

func TestParseLibraryFolders(t *testing.T) {
	paths, err := ParseLibraryFolders(fixture(t, "libraryfolders.vdf"))
	if err != nil {
		t.Fatalf("ParseLibraryFolders: %v", err)
	}
	want := []string{`C:\Program Files (x86)\Steam`, `D:\SteamLibrary`}
	if len(paths) != len(want) {
		t.Fatalf("paths = %v", paths)
	}
	for i, w := range want {
		if paths[i] != w {
			t.Errorf("paths[%d] = %q, want %q", i, paths[i], w)
		}
	}
}

// stubDisk/steam replace the platform seams for the duration of the test.
func stubDisk(t *testing.T, free, total int64) func() {
	orig := diskSpaceFn
	diskSpaceFn = func(string) (int64, int64, error) { return total, free, nil }
	return func() { diskSpaceFn = orig }
}

func stubSteamRunning(t *testing.T, running bool) func() {
	orig := steamRunningFn
	steamRunningFn = func() bool { return running }
	return func() { steamRunningFn = orig }
}

func TestScanLibraries(t *testing.T) {
	restoreDisk := stubDisk(t, 41*1<<30, 240*1<<30)
	defer restoreDisk()
	restoreSteam := stubSteamRunning(t, true)
	defer restoreSteam()

	ssd := t.TempDir()
	hdd := t.TempDir()
	write := func(dir, name string) {
		if err := os.WriteFile(filepath.Join(dir, "steamapps", name), fixture(t, name), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(ssd, "steamapps"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(hdd, "steamapps"), 0o755); err != nil {
		t.Fatal(err)
	}
	write(ssd, "appmanifest_105600.acf")
	write(hdd, "appmanifest_221380.acf")

	libs := []Library{
		{ID: "ssd0", Name: "SSD Cache", Path: ssd, Type: TypeSSDCache},
		{ID: "hdd0", Name: "HDD Master", Path: hdd, Type: TypeHDDMaster},
	}
	games, err := ScanLibraries(libs)
	if err != nil {
		t.Fatalf("ScanLibraries: %v", err)
	}
	if len(games) != 2 {
		t.Fatalf("games = %d, want 2", len(games))
	}
	byID := map[string]Game{}
	for _, g := range games {
		byID[g.Manifest.AppID] = g
	}
	ssdGame := byID["105600"]
	if ssdGame.State != StateActiveSSD || ssdGame.LibraryID != "ssd0" || ssdGame.Manifest.Name != "Terraria" || ssdGame.Manifest.InstallDir != "Terraria" || ssdGame.Manifest.BuildID != "12846270" {
		t.Errorf("ssd game = %+v", ssdGame)
	}
	hddGame := byID["221380"]
	if hddGame.State != StateStorageHDD || hddGame.LibraryID != "hdd0" {
		t.Errorf("hdd game = %+v", hddGame)
	}
	// Disk space was refreshed on both libraries.
	if libs[0].FreeBytes != 41*1<<30 || libs[1].TotalBytes != 240*1<<30 {
		t.Errorf("disk space not filled: %+v, %+v", libs[0], libs[1])
	}
	// The steam-running seam is used by callers; sanity-check injection.
	if !SteamRunning() || SteamRunning() != true {
		t.Error("SteamRunning should return the stubbed value")
	}
}

func TestScanLibrariesDuplicateManifest(t *testing.T) {
	restoreDisk := stubDisk(t, 1, 2)
	defer restoreDisk()
	restoreSteam := stubSteamRunning(t, false)
	defer restoreSteam()

	ssd := t.TempDir()
	hdd := t.TempDir()
	for _, dir := range []string{ssd, hdd} {
		if err := os.MkdirAll(filepath.Join(dir, "steamapps"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "steamapps", "appmanifest_105600.acf"), fixture(t, "appmanifest_105600.acf"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	libs := []Library{
		{ID: "ssd0", Path: ssd, Type: TypeSSDCache},
		{ID: "hdd0", Path: hdd, Type: TypeHDDMaster},
	}
	games, err := ScanLibraries(libs)
	if err == nil || !strings.Contains(err.Error(), "both") {
		t.Fatalf("expected duplicate-library error, got err=%v games=%v", err, games)
	}
	if len(games) != 1 {
		t.Errorf("games = %d, want 1 (first library wins)", len(games))
	}
}

func TestScanLibrariesValidationErrors(t *testing.T) {
	restore := stubDisk(t, 0, 0)
	defer restore()
	restoreSteam := stubSteamRunning(t, false)
	defer restoreSteam()

	libs := []Library{
		{ID: "bad", Path: t.TempDir(), Type: "floppy"},
		{ID: "notype", Path: t.TempDir()},
	}
	games, err := ScanLibraries(libs)
	if err == nil || !strings.Contains(err.Error(), "unknown type") {
		t.Fatalf("expected type error, got %v", err)
	}
	if len(games) != 0 {
		t.Errorf("games = %v, want none", games)
	}
}

func TestAppIDFromManifestFilename(t *testing.T) {
	if got := appIDFromManifestFilename(`C:\x\steamapps\appmanifest_105600.acf`); got != "105600" {
		t.Errorf("got %q", got)
	}
}

func TestScanLibrariesCustomGames(t *testing.T) {
	restoreDisk := stubDisk(t, 41*1<<30, 240*1<<30)
	defer restoreDisk()
	restoreSteam := stubSteamRunning(t, true)
	defer restoreSteam()

	ssd := t.TempDir()
	hdd := t.TempDir()

	// Steam game: Terraria in SSD with manifest
	if err := os.MkdirAll(filepath.Join(ssd, "steamapps", "common", "Terraria"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ssd, "steamapps", "appmanifest_105600.acf"), fixture(t, "appmanifest_105600.acf"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Non-Steam custom game: "CustomRPG" in SSD steamapps/common without manifest
	customDir := filepath.Join(ssd, "steamapps", "common", "CustomRPG")
	if err := os.MkdirAll(customDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(customDir, "game.exe"), []byte("payload"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Ignored dir: "Steam Controller Configs"
	if err := os.MkdirAll(filepath.Join(ssd, "steamapps", "common", "Steam Controller Configs"), 0o755); err != nil {
		t.Fatal(err)
	}

	libs := []Library{
		{ID: "ssd0", Name: "SSD Cache", Path: ssd, Type: TypeSSDCache},
		{ID: "hdd0", Name: "HDD Master", Path: hdd, Type: TypeHDDMaster},
	}

	games, err := ScanLibraries(libs)
	if err != nil {
		t.Fatalf("ScanLibraries: %v", err)
	}

	// Should have Terraria (Steam) and CustomRPG (Custom). Ignored dir should NOT be in games.
	if len(games) != 2 {
		t.Fatalf("games count = %d, want 2 (Terraria and CustomRPG)", len(games))
	}

	byName := map[string]Game{}
	for _, g := range games {
		byName[g.Manifest.Name] = g
	}

	terraria, ok := byName["Terraria"]
	if !ok || terraria.IsCustom {
		t.Errorf("Terraria = %+v, want IsCustom: false", terraria)
	}

	custom, ok := byName["CustomRPG"]
	if !ok || !custom.IsCustom {
		t.Fatalf("CustomRPG missing or not custom: %+v", custom)
	}
	if custom.State != StateActiveSSD {
		t.Errorf("CustomRPG state = %s, want %s", custom.State, StateActiveSSD)
	}
	if custom.LibraryID != "ssd0" {
		t.Errorf("CustomRPG library_id = %s, want ssd0", custom.LibraryID)
	}
	if custom.Manifest.SizeOnDisk != int64(len("payload")) {
		t.Errorf("CustomRPG size = %d, want %d", custom.Manifest.SizeOnDisk, len("payload"))
	}
	if custom.Manifest.AppID != CustomAppID("CustomRPG") {
		t.Errorf("CustomRPG AppID = %s, want %s", custom.Manifest.AppID, CustomAppID("CustomRPG"))
	}
}

func TestScanGenericGamesDirectory(t *testing.T) {
	// Standalone games directory on SSD without steamapps/common structure
	ssdGamesDir := filepath.Join(t.TempDir(), "StandaloneGames")
	gameDir := filepath.Join(ssdGamesDir, "GenshinImpact")
	if err := os.MkdirAll(gameDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(gameDir, "launcher.exe"), []byte("genshin_data"), 0o644); err != nil {
		t.Fatal(err)
	}

	libs := []Library{
		{ID: "generic_ssd", Path: ssdGamesDir, Type: TypeSSDCache},
	}

	// Under Plan 040, non-Steam generic libraries omit unmanifested directories
	games, err := ScanLibraries(libs)
	if err != nil {
		t.Fatalf("ScanLibraries: %v", err)
	}
	if len(games) != 0 {
		t.Fatalf("unmanifested generic directory must not be auto-detected, got %d games", len(games))
	}

	// Once registered with zappmanifest.json, the game is discovered
	zm := ZappManifest{
		Name:        "Genshin Impact",
		InstallDir:  "GenshinImpact",
		SwapEnabled: true,
	}
	if err := WriteZappManifest(gameDir, zm); err != nil {
		t.Fatal(err)
	}

	games, err = ScanLibraries(libs)
	if err != nil {
		t.Fatalf("ScanLibraries: %v", err)
	}
	if len(games) != 1 {
		t.Fatalf("games count after manifest = %d, want 1", len(games))
	}

	g := games[0]
	if g.Manifest.Name != "Genshin Impact" || !g.IsCustom {
		t.Errorf("game = %+v, want Genshin Impact custom", g)
	}
	if g.State != StateActiveSSD {
		t.Errorf("state = %s, want %s", g.State, StateActiveSSD)
	}
	if g.LibraryID != "generic_ssd" {
		t.Errorf("library_id = %s, want generic_ssd", g.LibraryID)
	}
}

func TestScanNestedGenericGamesDirectory(t *testing.T) {
	// Standalone games directory on SSD with multi-level publisher/launcher hierarchy:
	// - GRYPHLINK/games/EndField Game
	// - Riot Games/VALORANT
	ssdGamesDir := filepath.Join(t.TempDir(), "Games")
	endfieldDir := filepath.Join(ssdGamesDir, "GRYPHLINK", "games", "EndField Game")
	if err := os.MkdirAll(endfieldDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(endfieldDir, "Endfield.exe"), []byte("endfield_binary"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Add zappmanifest.json to Endfield
	zm := ZappManifest{
		Name:        "Arknights: Endfield",
		InstallDir:  "GRYPHLINK/games/EndField Game",
		CoverURL:    "cover.png",
		SwapEnabled: true,
	}
	if err := WriteZappManifest(endfieldDir, zm); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(endfieldDir, "cover.png"), []byte("png_bytes"), 0o644); err != nil {
		t.Fatal(err)
	}

	valorantDir := filepath.Join(ssdGamesDir, "Riot Games", "VALORANT")
	if err := os.MkdirAll(valorantDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(valorantDir, "VALORANT.exe"), []byte("valorant_binary"), 0o644); err != nil {
		t.Fatal(err)
	}

	libs := []Library{
		{ID: "games_ssd", Path: ssdGamesDir, Type: TypeSSDCache},
	}

	// Generic non-Steam library: unmanifested Valorant is NOT auto-detected
	games, err := ScanLibraries(libs)
	if err != nil {
		t.Fatalf("ScanLibraries: %v", err)
	}

	if len(games) != 1 {
		t.Fatalf("games count = %d, want 1 (only manifested Endfield); got: %+v", len(games), games)
	}
	if games[0].Manifest.Name != "Arknights: Endfield" {
		t.Errorf("got %q, want Arknights: Endfield", games[0].Manifest.Name)
	}

	// Now register Valorant by adding zappmanifest.json
	zmVal := ZappManifest{
		ID:          "riot-games/valorant",
		Name:        "VALORANT",
		InstallDir:  "Riot Games/VALORANT",
		SwapEnabled: true,
	}
	if err := WriteZappManifest(valorantDir, zmVal); err != nil {
		t.Fatal(err)
	}

	games2, err := ScanLibraries(libs)
	if err != nil {
		t.Fatalf("ScanLibraries after manifest: %v", err)
	}
	if len(games2) != 2 {
		t.Fatalf("games count after manifest = %d, want 2; got: %+v", len(games2), games2)
	}

	var foundEndfield, foundValorant bool
	for _, g := range games2 {
		if g.Manifest.Name == "Arknights: Endfield" {
			foundEndfield = true
			if g.Manifest.InstallDir != "GRYPHLINK/games/EndField Game" {
				t.Errorf("Endfield InstallDir = %q, want GRYPHLINK/games/EndField Game", g.Manifest.InstallDir)
			}
			if g.CoverURL != "cover.png" {
				t.Errorf("Endfield CoverURL = %q, want cover.png", g.CoverURL)
			}
		}
		if g.Manifest.Name == "VALORANT" {
			foundValorant = true
			if g.Manifest.InstallDir != "Riot Games/VALORANT" {
				t.Errorf("Valorant InstallDir = %q, want Riot Games/VALORANT", g.Manifest.InstallDir)
			}
		}
	}
	if !foundEndfield {
		t.Error("expected Arknights: Endfield to be discovered")
	}
	if !foundValorant {
		t.Error("expected VALORANT to be discovered")
	}
}

func TestZappManifestAndRealFolderSize(t *testing.T) {
	tmp := t.TempDir()
	ssd := filepath.Join(tmp, "SSD")
	hdd := filepath.Join(tmp, "HDD")

	// Setup SSD library with a game that has a manifest stating 100 bytes,
	// but actual folder has 5000 bytes (mimicking WuWa/launcher game patching).
	ssdCommon := filepath.Join(ssd, "steamapps", "common", "WutheringWaves")
	if err := os.MkdirAll(ssdCommon, 0o755); err != nil {
		t.Fatal(err)
	}
	bigPayload := make([]byte, 5000)
	if err := os.WriteFile(filepath.Join(ssdCommon, "Client-Win64-Shipping.exe"), bigPayload, 0o644); err != nil {
		t.Fatal(err)
	}

	// Create appmanifest with SizeOnDisk = 100
	manifestPath := filepath.Join(ssd, "steamapps", "appmanifest_12345.acf")
	acfContent := `"AppState"
{
	"appid"		"12345"
	"name"		"Wuthering Waves"
	"installdir"		"WutheringWaves"
	"SizeOnDisk"		"100"
	"buildid"		"999"
}
`
	if err := os.WriteFile(manifestPath, []byte(acfContent), 0o644); err != nil {
		t.Fatal(err)
	}

	// Write custom zappmanifest.json into WutheringWaves
	zappMan := ZappManifest{
		ID:           "12345",
		Name:         "Wuthering Waves (Custom)",
		InstallDir:   "WutheringWaves",
		CoverURL:     "https://example.com/cover.png",
		SwapEnabled:  true,
		IsNativeHDD:  false,
		Tags:         []string{"RPG", "OpenWorld"},
	}
	if err := WriteZappManifest(ssdCommon, zappMan); err != nil {
		t.Fatalf("WriteZappManifest: %v", err)
	}

	// Setup HDD library with backup of WutheringWaves folder
	hddCommon := filepath.Join(hdd, "steamapps", "common", "WutheringWaves")
	if err := os.MkdirAll(hddCommon, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(hddCommon, "backup.pak"), []byte("backup"), 0o644); err != nil {
		t.Fatal(err)
	}

	libs := []Library{
		{ID: "ssd0", Name: "SSD Cache", Path: ssd, Type: TypeSSDCache},
		{ID: "hdd0", Name: "HDD Master", Path: hdd, Type: TypeHDDMaster},
	}

	games, err := ScanLibraries(libs)
	if err != nil {
		t.Fatalf("ScanLibraries: %v", err)
	}

	if len(games) != 1 {
		t.Fatalf("got %d games, want 1", len(games))
	}

	g := games[0]
	// Check size calculation updated to real folder size (5000 payload + zappmanifest.json)
	if g.Manifest.SizeOnDisk < 5000 {
		t.Errorf("SizeOnDisk = %d, want >= 5000", g.Manifest.SizeOnDisk)
	}

	// Check zapp manifest metadata
	if g.Manifest.Name != "Wuthering Waves (Custom)" {
		t.Errorf("Name = %s, want Wuthering Waves (Custom)", g.Manifest.Name)
	}
	if g.CoverURL != "https://example.com/cover.png" {
		t.Errorf("CoverURL = %s, want https://example.com/cover.png", g.CoverURL)
	}
	if !g.SwapEnabled {
		t.Errorf("SwapEnabled = false, want true")
	}
	if !g.HasHDDBackup {
		t.Errorf("HasHDDBackup = false, want true because HDD has folder")
	}
	if len(g.Tags) != 2 || g.Tags[0] != "RPG" {
		t.Errorf("Tags = %v, want [RPG OpenWorld]", g.Tags)
	}
}
