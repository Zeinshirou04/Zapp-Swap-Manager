package vdf

import (
	"testing"
)

func TestParseNestedQuotedComments(t *testing.T) {
	src := `
// top-level comment
"libraryfolders"
{
	"contentbuildid"	"123" // trailing comment
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"note"		"a \"quoted\" word"
		"empty"
		{
		}
	}
	"1" { "path" "D:\\SteamLibrary" }
}`
	root, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if got := root.Get("libraryfolders", "0", "path").Value; got != `C:\Program Files (x86)\Steam` {
		t.Errorf("path = %q", got)
	}
	if got := root.Get("libraryfolders", "0", "note").Value; got != `a "quoted" word` {
		t.Errorf("note = %q", got)
	}
	if got := root.Get("libraryfolders", "contentbuildid").Value; got != "123" {
		t.Errorf("contentbuildid = %q", got)
	}
	if root.Get("libraryfolders", "0", "empty") == nil {
		t.Error("empty nested block not found")
	}
	if got := root.Get("libraryfolders", "1", "path").Value; got != `D:\SteamLibrary` {
		t.Errorf("path 1 = %q", got)
	}
	if got := len(root.Get("libraryfolders").Children); got != 3 {
		t.Errorf("children = %d, want 3", got)
	}
}

func TestParseBareTokens(t *testing.T) {
	root, err := Parse([]byte("key value\nblock\n{\ninner 1\n}"))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if root.Get("key").Value != "value" {
		t.Errorf("key = %q", root.Get("key").Value)
	}
	if root.Get("block", "inner").Value != "1" {
		t.Errorf("inner = %q", root.Get("block", "inner").Value)
	}
}

func TestParseErrors(t *testing.T) {
	cases := map[string]string{
		"stray close brace":     "key val }",
		"missing block brace":   "a\n{\n\"k\" \"v\"",
		"unterminated string":   "a \"never ends",
		"key with no value":     "a { b",
		"trailing garbage":      "key val extra",
		"missing string escape": `a "ends with \`,
	}
	for name, src := range cases {
		if _, err := Parse([]byte(src)); err == nil {
			t.Errorf("%s: expected error, got nil", name)
		}
	}
}

func TestGetMissing(t *testing.T) {
	root, err := Parse([]byte("\"a\" \"b\""))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if root.Get("a", "b") != nil || root.Get("missing") != nil {
		t.Error("Get should return nil for missing nodes")
	}
}

func TestParseUTF8BOM(t *testing.T) {
	bomData := append([]byte("\xef\xbb\xbf"), []byte(`"AppState" { "appid" "730" }`)...)
	root, err := Parse(bomData)
	if err != nil {
		t.Fatalf("Parse with BOM failed: %v", err)
	}
	if got := root.Get("AppState", "appid").Value; got != "730" {
		t.Fatalf("expected 730, got %q", got)
	}
}
