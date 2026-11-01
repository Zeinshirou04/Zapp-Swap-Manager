// Package vdf parses Valve's KeyValues (VDF) text format used by
// libraryfolders.vdf and appmanifest_<appid>.acf.
package vdf

import (
	"fmt"
	"strings"
)

// KeyValue is a VDF node: a leaf has Value set; a branch has Children set.
// Child is an index over Children; duplicate keys keep the last one in Child
// but every occurrence stays in Children.
type KeyValue struct {
	Key      string
	Value    string
	Children []*KeyValue
	Child    map[string]*KeyValue
}

// Get walks nested keys, returning nil if any step is missing.
func (kv *KeyValue) Get(path ...string) *KeyValue {
	cur := kv
	for _, p := range path {
		if cur == nil {
			return nil
		}
		cur = cur.Child[p]
	}
	return cur
}

// Parse parses a whole VDF document into a root block node.
func Parse(data []byte) (*KeyValue, error) {
	p := parser{src: string(data)}
	node, err := p.parseBlock(true)
	if err != nil {
		return nil, err
	}
	if p.pos < len(p.src) {
		return nil, fmt.Errorf("vdf: unexpected trailing data at offset %d", p.pos)
	}
	return node, nil
}

type parser struct {
	src string
	pos int
}

func (p *parser) eof() bool { return p.pos >= len(p.src) }

// skipJunk skips whitespace and // line comments.
func (p *parser) skipJunk() {
	for !p.eof() {
		c := p.src[p.pos]
		if c == ' ' || c == '\t' || c == '\r' || c == '\n' {
			p.pos++
			continue
		}
		if c == '/' && p.pos+1 < len(p.src) && p.src[p.pos+1] == '/' {
			for !p.eof() && p.src[p.pos] != '\n' {
				p.pos++
			}
			continue
		}
		return
	}
}

func (p *parser) peek() byte { return p.src[p.pos] }

func isTokenEnd(c byte) bool {
	return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '{' || c == '}'
}

// readToken reads a quoted (with backslash escapes) or bare token.
func (p *parser) readToken() (string, error) {
	if p.eof() {
		return "", fmt.Errorf("vdf: unexpected end of input")
	}
	if p.peek() == '"' {
		p.pos++
		var b strings.Builder
		for {
			if p.eof() {
				return "", fmt.Errorf("vdf: unterminated quoted string")
			}
			c := p.src[p.pos]
			switch c {
			case '"':
				p.pos++
				return b.String(), nil
			case '\\':
				if p.pos+1 >= len(p.src) {
					return "", fmt.Errorf("vdf: dangling backslash in quoted string")
				}
				p.pos++
				switch p.src[p.pos] {
				case 'n':
					b.WriteByte('\n')
				case 'r':
					b.WriteByte('\r')
				case 't':
					b.WriteByte('\t')
				default: // \\ and \" fall out to a literal backslash or quote
					b.WriteByte(p.src[p.pos])
				}
				p.pos++
			default:
				b.WriteByte(c)
				p.pos++
			}
		}
	}
	start := p.pos
	for !p.eof() && !isTokenEnd(p.peek()) {
		p.pos++
	}
	if p.pos == start {
		return "", fmt.Errorf("vdf: unexpected %q at offset %d", string(p.peek()), p.pos)
	}
	return p.src[start:p.pos], nil
}

// parseBlock parses "{ ... }" contents (or a whole document when root).
func (p *parser) parseBlock(root bool) (*KeyValue, error) {
	node := &KeyValue{Child: map[string]*KeyValue{}}
	for {
		p.skipJunk()
		if p.eof() {
			if root {
				return node, nil
			}
			return nil, fmt.Errorf("vdf: unexpected end of input inside block (missing '}'?)")
		}
		if p.peek() == '}' {
			p.pos++
			if root {
				return nil, fmt.Errorf("vdf: '}' outside of any block")
			}
			return node, nil
		}
		key, err := p.readToken()
		if err != nil {
			return nil, err
		}
		p.skipJunk()
		var child *KeyValue
		if !p.eof() && p.peek() == '{' {
			p.pos++
			child, err = p.parseBlock(false)
			if err != nil {
				return nil, err
			}
			child.Key = key
		} else {
			val, err := p.readToken()
			if err != nil {
				return nil, fmt.Errorf("vdf: key %q: %w", key, err)
			}
			child = &KeyValue{Key: key, Value: val}
		}
		node.Children = append(node.Children, child)
		node.Child[key] = child
	}
}
