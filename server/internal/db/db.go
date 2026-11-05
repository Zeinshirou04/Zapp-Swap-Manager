package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	DisplayName  string    `json:"display_name"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Device struct {
	ID           string     `json:"id"`
	UserID       string     `json:"user_id"`
	Name         string     `json:"name"`
	DeviceSecret string     `json:"-"`
	LastSeen     *time.Time `json:"last_seen"`
	Online       bool       `json:"online"`
	IPAddress    string     `json:"ip_address,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

type Store struct {
	db *sql.DB
}

func Open(dbPath string) (*Store, error) {
	dir := filepath.Dir(dbPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}

	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)", dbPath)
	database, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	database.SetMaxOpenConns(1)

	s := &Store{db: database}
	if err := s.migrate(); err != nil {
		database.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		display_name TEXT NOT NULL,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

	CREATE TABLE IF NOT EXISTS devices (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		device_secret TEXT NOT NULL,
		last_seen DATETIME,
		online INTEGER DEFAULT 0,
		ip_address TEXT,
		created_at DATETIME NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
	`
	_, err := s.db.Exec(schema)
	return err
}

func (s *Store) CreateUser(u *User) error {
	query := `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)`
	now := time.Now().UTC()
	u.CreatedAt = now
	u.UpdatedAt = now
	_, err := s.db.Exec(query, u.ID, u.Email, u.PasswordHash, u.DisplayName, u.CreatedAt, u.UpdatedAt)
	return err
}

func (s *Store) GetUserByEmail(email string) (*User, error) {
	query := `SELECT id, email, password_hash, display_name, created_at, updated_at FROM users WHERE email = ?`
	row := s.db.QueryRow(query, email)

	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) GetUserByID(id string) (*User, error) {
	query := `SELECT id, email, password_hash, display_name, created_at, updated_at FROM users WHERE id = ?`
	row := s.db.QueryRow(query, id)

	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) RegisterDevice(d *Device) error {
	query := `INSERT INTO devices (id, user_id, name, device_secret, last_seen, online, ip_address, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	now := time.Now().UTC()
	d.CreatedAt = now
	d.LastSeen = &now
	_, err := s.db.Exec(query, d.ID, d.UserID, d.Name, d.DeviceSecret, d.LastSeen, d.Online, d.IPAddress, d.CreatedAt)
	return err
}

func (s *Store) ListDevices(userID string) ([]Device, error) {
	query := `SELECT id, user_id, name, device_secret, last_seen, online, ip_address, created_at FROM devices WHERE user_id = ? ORDER BY created_at DESC`
	rows, err := s.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []Device
	for rows.Next() {
		var d Device
		if err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.DeviceSecret, &d.LastSeen, &d.Online, &d.IPAddress, &d.CreatedAt); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, nil
}

func (s *Store) GetDevice(id string) (*Device, error) {
	query := `SELECT id, user_id, name, device_secret, last_seen, online, ip_address, created_at FROM devices WHERE id = ?`
	row := s.db.QueryRow(query, id)

	var d Device
	if err := row.Scan(&d.ID, &d.UserID, &d.Name, &d.DeviceSecret, &d.LastSeen, &d.Online, &d.IPAddress, &d.CreatedAt); err != nil {
		return nil, err
	}
	return &d, nil
}

func (s *Store) UpdateDeviceStatus(id string, online bool, ip string) error {
	query := `UPDATE devices SET online = ?, ip_address = ?, last_seen = ? WHERE id = ?`
	now := time.Now().UTC()
	_, err := s.db.Exec(query, online, ip, now, id)
	return err
}
