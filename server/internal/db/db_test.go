package db_test

import (
	"path/filepath"
	"testing"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/db"
)

func TestStore_UserAndDeviceFlow(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")

	store, err := db.Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	defer store.Close()

	user := db.User{
		ID:           "u-123",
		Email:        "gamer@example.com",
		PasswordHash: "hashed-secret",
		DisplayName:  "GamerOne",
	}

	if err := store.CreateUser(&user); err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Fetch by email
	fetched, err := store.GetUserByEmail("gamer@example.com")
	if err != nil {
		t.Fatalf("failed to fetch user by email: %v", err)
	}
	if fetched.DisplayName != "GamerOne" {
		t.Errorf("expected GamerOne, got %s", fetched.DisplayName)
	}

	// Register device
	device := db.Device{
		ID:           "d-456",
		UserID:       user.ID,
		Name:         "Main Rig",
		DeviceSecret: "secret-key",
		Online:       false,
	}

	if err := store.RegisterDevice(&device); err != nil {
		t.Fatalf("failed to register device: %v", err)
	}

	devices, err := store.ListDevices(user.ID)
	if err != nil {
		t.Fatalf("failed to list devices: %v", err)
	}
	if len(devices) != 1 {
		t.Fatalf("expected 1 device, got %d", len(devices))
	}

	// Update device status
	if err := store.UpdateDeviceStatus(device.ID, true, "192.168.1.50"); err != nil {
		t.Fatalf("failed to update status: %v", err)
	}

	d, err := store.GetDevice(device.ID)
	if err != nil {
		t.Fatalf("failed to get device: %v", err)
	}
	if !d.Online || d.IPAddress != "192.168.1.50" {
		t.Errorf("device status update did not persist correctly: %+v", d)
	}
}
