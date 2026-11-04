package transfer

import "os"

var createJunctionFn = defaultCreateJunction
var isJunctionFn = defaultIsJunction

// CreateJunction creates a directory junction (or symlink on non-Windows) from link to target.
func CreateJunction(link, target string) error {
	return createJunctionFn(link, target)
}

// IsJunction reports whether path is a directory junction or symlink.
func IsJunction(path string) bool {
	return isJunctionFn(path)
}

// RemoveJunction removes the junction without deleting contents of the target.
func RemoveJunction(path string) error {
	if !IsJunction(path) {
		return nil
	}
	return os.Remove(path)
}
