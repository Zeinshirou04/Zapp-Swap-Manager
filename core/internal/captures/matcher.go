package captures

import (
	"path/filepath"
	"strings"
	"unicode"
)

type matchTerm struct {
	words   string
	compact string
	isAlias bool
}

func normalizeWords(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	lastSpace := true
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			lastSpace = false
		} else if !lastSpace {
			b.WriteByte(' ')
			lastSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

func compactAlnum(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func buildGameTerms(target GameTarget) []matchTerm {
	var out []matchTerm
	seen := map[string]bool{}
	add := func(raw string, isAlias bool) {
		w := normalizeWords(raw)
		if len(w) < 2 {
			return
		}
		key := w
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, matchTerm{
			words:   w,
			compact: compactAlnum(raw),
			isAlias: isAlias,
		})
	}

	// Custom aliases are evaluated first so matched_by reflects user aliases accurately.
	for _, alias := range target.Aliases {
		add(alias, true)
	}
	add(target.Name, false)
	if baseDir := filepath.Base(filepath.FromSlash(target.InstallDir)); baseDir != "" && baseDir != "." {
		add(baseDir, false)
	}
	return out
}

func termMatchesCandidate(term matchTerm, rawCandidate string) bool {
	if strings.TrimSpace(rawCandidate) == "" {
		return false
	}
	hayWords := normalizeWords(rawCandidate)
	if hayWords == "" {
		return false
	}

	// Token-boundary padded comparison avoids false positives on short words (e.g. "ark" in "dark").
	if strings.Contains(" "+hayWords+" ", " "+term.words+" ") {
		return true
	}

	// Allow compact concatenation matching (e.g. "CounterStrike2_2026.mp4" or "ArknightsEndfield")
	// for sufficiently distinct names/aliases (>= 5 chars).
	if len(term.compact) >= 5 {
		hayCompact := compactAlnum(rawCandidate)
		if strings.Contains(hayCompact, term.compact) {
			return true
		}
	}
	return false
}

func isDesktopFolder(folderName string) bool {
	w := normalizeWords(folderName)
	return w == "desktop" || w == "desktop capture"
}

func matchCapture(terms []matchTerm, source, folderName, fileName, windowTitle, processName string) (matchedBy string, ok bool) {
	if len(terms) == 0 {
		return "", false
	}

	// 1. Check ShadowPlay / folder hierarchy match first (ignoring NVIDIA's generic Desktop folder unless explicitly aliased).
	if folderName != "" {
		for _, term := range terms {
			if isDesktopFolder(folderName) && !term.isAlias {
				continue
			}
			if termMatchesCandidate(term, folderName) {
				if term.isAlias {
					return MatchedByAlias, true
				}
				if source == SourceShadowPlay {
					return MatchedByShadowPlayFolder, true
				}
				return MatchedByFilename, true
			}
		}
	}

	// 2. Check ShareX History.db WindowTitle and ProcessName metadata.
	if windowTitle != "" || processName != "" {
		procBase := strings.TrimSuffix(processName, filepath.Ext(processName))
		for _, term := range terms {
			if termMatchesCandidate(term, windowTitle) || termMatchesCandidate(term, procBase) {
				if term.isAlias {
					return MatchedByAlias, true
				}
				return MatchedByShareXHistory, true
			}
		}
	}

	// 3. Check capture filename without extension.
	stem := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	for _, term := range terms {
		if termMatchesCandidate(term, stem) {
			if term.isAlias {
				return MatchedByAlias, true
			}
			return MatchedByFilename, true
		}
	}

	return "", false
}
