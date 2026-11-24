package main

import (
	"bufio"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// TextMatch is one line of a file that contains the text searched for.
type TextMatch struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Text string `json:"text"`
}

// Files larger than this are skipped by SearchText: scripts and levels are far smaller.
const searchMaxFileBytes = 4 << 20

// searchDefaultExtensions are the text formats GSuite works with.
var searchDefaultExtensions = []string{"txt", "nw", "gmap", "gani", "gs", "gs2", "npc", "md"}

// SearchText looks for query (case-insensitive) in the text files under dir, including
// subfolders, and returns up to limit matching lines. extensions limits which files are
// read (without dots); when empty, the formats GSuite works with are searched.
func (s *AppService) SearchText(dir, query string, extensions []string, limit int) ([]TextMatch, error) {
	if strings.TrimSpace(query) == "" {
		return nil, fmt.Errorf("nothing to search for")
	}
	needle := strings.ToLower(query)
	return searchLines(dir, extensions, limit, func(line string) bool { return strings.Contains(line, needle) })
}

// SearchWords is SearchText for several words: a line matches when it holds every one of
// them, in any order (case-insensitive).
func (s *AppService) SearchWords(dir string, words []string, extensions []string, limit int) ([]TextMatch, error) {
	needles := make([]string, 0, len(words))
	for _, word := range words {
		if word = strings.ToLower(strings.TrimSpace(word)); word != "" {
			needles = append(needles, word)
		}
	}
	if len(needles) == 0 {
		return nil, fmt.Errorf("nothing to search for")
	}
	return searchLines(dir, extensions, limit, func(line string) bool {
		for _, needle := range needles {
			if !strings.Contains(line, needle) {
				return false
			}
		}
		return true
	})
}

// searchLines walks the text files under dir and collects the lines that match, which is
// given each line in lower case.
func searchLines(dir string, extensions []string, limit int, match func(line string) bool) ([]TextMatch, error) {
	root, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	if info, err := os.Stat(root); err != nil || !info.IsDir() {
		return nil, fmt.Errorf("%s is not a folder", dir)
	}
	if len(extensions) == 0 {
		extensions = searchDefaultExtensions
	}
	wanted := make(map[string]bool, len(extensions))
	for _, ext := range extensions {
		wanted[strings.ToLower(strings.TrimPrefix(ext, "."))] = true
	}
	if limit <= 0 {
		limit = 50
	}
	matches := make([]TextMatch, 0, limit)
	walkErr := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			if name := entry.Name(); path != root && strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !wanted[strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))] {
			return nil
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		if info, err := entry.Info(); err != nil || info.Size() > searchMaxFileBytes {
			return nil
		}
		file, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer file.Close()
		scanner := bufio.NewScanner(file)
		scanner.Buffer(make([]byte, 64<<10), 1<<20)
		for line := 1; scanner.Scan(); line++ {
			text := scanner.Text()
			if !match(strings.ToLower(text)) {
				continue
			}
			text = strings.TrimSpace(text)
			if len(text) > 240 {
				cut := 240
				for cut > 0 && !utf8.RuneStart(text[cut]) {
					cut--
				}
				text = text[:cut]
			}
			matches = append(matches, TextMatch{Path: path, Line: line, Text: text})
			if len(matches) >= limit {
				return filepath.SkipAll
			}
		}
		return nil
	})
	return matches, walkErr
}
