package mcp

import (
	"os"
	"testing"
)

func TestSaveConfigReplacesTheFileWhole(t *testing.T) {
	dir := t.TempDir()
	for _, token := range []string{"first", "second"} {
		if err := SaveConfig(dir, Config{Enabled: true, Port: 5123, Token: token}); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != configFileName {
		t.Fatalf("config folder holds %v, want only %s", entries, configFileName)
	}
	if got := LoadConfig(dir).Token; got != "second" {
		t.Errorf("token %q, want second", got)
	}
	if info, _ := entries[0].Info(); info.Mode().Perm() != 0600 && os.PathSeparator == '/' {
		t.Errorf("mode %v, want 0600", info.Mode().Perm())
	}
}

func TestSaveConfigFailureKeepsTheOldFile(t *testing.T) {
	dir := t.TempDir()
	if err := SaveConfig(dir, Config{Enabled: true, Port: 5123, Token: "keep"}); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0500); err != nil {
		t.Skip("cannot make the folder read-only")
	}
	defer os.Chmod(dir, 0700)
	if os.WriteFile(dir+"/probe", nil, 0600) == nil {
		t.Skip("folder is still writable (running as root)")
	}
	if SaveConfig(dir, Config{Enabled: true, Port: 5123, Token: "new"}) == nil {
		t.Fatal("expected an error")
	}
	if got := LoadConfig(dir).Token; got != "keep" {
		t.Errorf("token %q, want keep", got)
	}
}
