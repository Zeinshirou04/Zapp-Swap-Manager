package steam

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/vdf"
)

// StateFlags bits we care about (appmanifest_*.acf "StateFlags"):
// 4 = fully installed; any other set bit marks an update/download in flight.
const (
	stateFlagFullyInstalled uint32 = 4
)

// Manifest is the part of appmanifest_<appid>.acf the plan requires.
type Manifest struct {
	AppID      string
	Name       string
	InstallDir string
	SizeOnDisk int64
	BuildID    string
	StateFlags uint32
	LastPlayed int64
}

// FullyInstalled reports StateFlags bit 4.
func (m Manifest) FullyInstalled() bool { return m.StateFlags&stateFlagFullyInstalled != 0 }

// UpdatePending reports any StateFlags bit other than "fully installed",
// which per docs/safety.md means a backup must be skipped.
func (m Manifest) UpdatePending() bool { return m.StateFlags&^stateFlagFullyInstalled != 0 }

// ParseManifest parses one appmanifest_<appid>.acf payload.
func ParseManifest(data []byte) (Manifest, error) {
	root, err := vdf.Parse(data)
	if err != nil {
		return Manifest{}, fmt.Errorf("parse manifest: %w", err)
	}
	state := root.Get("AppState")
	if state == nil {
		return Manifest{}, fmt.Errorf("parse manifest: missing \"AppState\" block")
	}
	var m Manifest
	m.AppID = valueOf(state, "appid")
	m.Name = valueOf(state, "name")
	m.InstallDir = valueOf(state, "installdir")
	m.BuildID = valueOf(state, "buildid")
	if v := valueOf(state, "SizeOnDisk"); v != "" {
		if m.SizeOnDisk, err = strconv.ParseInt(v, 10, 64); err != nil {
			return Manifest{}, fmt.Errorf("manifest %s: SizeOnDisk %q: %w", m.AppID, v, err)
		}
	}
	if v := valueOf(state, "StateFlags"); v != "" {
		flags, err := strconv.ParseUint(v, 10, 32)
		if err != nil {
			return Manifest{}, fmt.Errorf("manifest %s: StateFlags %q: %w", m.AppID, v, err)
		}
		m.StateFlags = uint32(flags)
	}
	if v := valueOf(state, "LastPlayed"); v != "" {
		if lp, err := strconv.ParseInt(v, 10, 64); err == nil {
			m.LastPlayed = lp
		}
	}
	if m.AppID == "" {
		return m, fmt.Errorf("parse manifest: missing appid")
	}
	return m, nil
}

func valueOf(kv *vdf.KeyValue, key string) string {
	if n := kv.Get(key); n != nil {
		return strings.TrimSpace(n.Value)
	}
	return ""
}
