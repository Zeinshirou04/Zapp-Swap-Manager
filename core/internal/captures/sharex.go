package captures

import (
	"database/sql"
	"encoding/json"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite" // pure-Go (CGO-free) SQLite driver for reading ShareX History.db
)

type shareXHistoryEntry struct {
	FilePath    string
	FileName    string
	CapturedAt  time.Time
	WindowTitle string
	ProcessName string
}

type shareXTags struct {
	WindowTitle string `json:"WindowTitle"`
	ProcessName string `json:"ProcessName"`
}

func readShareXHistory(dbPath string, maxRows int) ([]shareXHistoryEntry, map[string]shareXHistoryEntry) {
	byPath := map[string]shareXHistoryEntry{}
	if strings.TrimSpace(dbPath) == "" || !existingFile(dbPath) {
		return nil, byPath
	}
	if maxRows <= 0 {
		maxRows = 2500
	}

	dsn := "file:" + dbPath + "?_pragma=query_only(ON)&_pragma=busy_timeout(2000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, byPath
	}
	defer db.Close()

	rows, err := db.Query(
		`SELECT FilePath, FileName, DateTime, Tags FROM History ORDER BY DateTime DESC LIMIT ?`,
		maxRows,
	)
	if err != nil {
		return nil, byPath
	}
	defer rows.Close()

	var list []shareXHistoryEntry
	for rows.Next() {
		var filePath, fileName, dtStr, tagsStr sql.NullString
		if err := rows.Scan(&filePath, &fileName, &dtStr, &tagsStr); err != nil {
			continue
		}
		p := strings.TrimSpace(filePath.String)
		if p == "" {
			continue
		}
		clean := filepath.Clean(p)
		entry := shareXHistoryEntry{
			FilePath:   clean,
			FileName:   strings.TrimSpace(fileName.String),
			CapturedAt: parseShareXTimestamp(dtStr.String),
		}
		if entry.FileName == "" {
			entry.FileName = filepath.Base(clean)
		}
		if strings.TrimSpace(tagsStr.String) != "" {
			var tags shareXTags
			if jsonErr := json.Unmarshal([]byte(tagsStr.String), &tags); jsonErr == nil {
				entry.WindowTitle = strings.TrimSpace(tags.WindowTitle)
				entry.ProcessName = strings.TrimSpace(tags.ProcessName)
			}
		}
		list = append(list, entry)
		byPath[canonicalKey(clean)] = entry
	}
	return list, byPath
}

func parseShareXTimestamp(raw string) time.Time {
	s := strings.TrimSpace(raw)
	if s == "" {
		return time.Time{}
	}
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.9999999",
		"2006-01-02 15:04:05.9999999",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range formats {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t
		}
	}
	return time.Time{}
}
