package transfer

import (
	"fmt"
	"io/fs"
	"path/filepath"
)

// TreeStats summarizes a directory tree: number of files and total bytes.
type TreeStats struct {
	Files int64
	Bytes int64
}

// MeasureTree walks a directory tree counting regular files and their sizes.
func MeasureTree(root string) (TreeStats, error) {
	var st TreeStats
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		st.Files++
		st.Bytes += info.Size()
		return nil
	})
	if err != nil {
		return TreeStats{}, fmt.Errorf("measure tree %s: %w", root, err)
	}
	return st, nil
}

// VerifyMatch verifies the target tree matches the source exactly (file
// count and byte size). This is a strict, zero-tolerance check: any
// difference aborts, because a match is the precondition for deleting the
// SSD copy (docs/safety.md evict/promote step 2).
func VerifyMatch(src, dst string) error {
	ss, err := MeasureTree(src)
	if err != nil {
		return fmt.Errorf("verify: source: %w", err)
	}
	sd, err := MeasureTree(dst)
	if err != nil {
		return fmt.Errorf("verify: target: %w", err)
	}
	if ss.Files != sd.Files || ss.Bytes != sd.Bytes {
		return fmt.Errorf("verify: target does not match source: %s had %d files / %d bytes, %s has %d files / %d bytes",
			src, ss.Files, ss.Bytes, dst, sd.Files, sd.Bytes)
	}
	return nil
}
