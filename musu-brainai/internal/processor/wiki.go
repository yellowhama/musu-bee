package processor

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/blevesearch/bleve/v2"
	"gopkg.in/yaml.v3"
)

type WikiProcessor struct {
	BaseDir string
	Project string
}

type IndexEntry struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	Source  string   `json:"source"`
	Project string   `json:"project"`
	Path    string   `json:"path"`
	Date    string   `json:"date"`
	Tags    []string `json:"tags,omitempty"`
	Summary string   `json:"summary,omitempty"`
	Content string   `json:"-"` // Not in JSON but indexed in Bleve
}

func NewWikiProcessor(baseDir string, project string) *WikiProcessor {
	if project == "" {
		project = "default"
	}
	return &WikiProcessor{BaseDir: baseDir, Project: project}
}

func (p *WikiProcessor) SaveToWiki(source, id, title, content string, tags []string, summary string) (string, error) {
	// New path structure: wiki/projects/{project}/{source}/{file}
	dir := filepath.Join(p.BaseDir, "projects", p.Project, source)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	safeTitle := sanitizeFilename(title)
	filename := fmt.Sprintf("%s_%s.md", id, safeTitle)
	if len(filename) > 200 {
		filename = filename[:200] + ".md"
	}
	path := filepath.Join(dir, filename)

	// Build Markdown with Frontmatter
	var sb strings.Builder
	sb.WriteString("---\n")
	sb.WriteString(fmt.Sprintf("title: %q\n", title))
	sb.WriteString(fmt.Sprintf("source: %s\n", source))
	sb.WriteString(fmt.Sprintf("project: %s\n", p.Project))
	sb.WriteString(fmt.Sprintf("id: %s\n", id))
	sb.WriteString(fmt.Sprintf("date: %s\n", time.Now().Format("2006-01-02")))
	if len(tags) > 0 {
		sb.WriteString("tags:\n")
		for _, t := range tags {
			sb.WriteString(fmt.Sprintf("  - %s\n", t))
		}
	}
	if summary != "" {
		sb.WriteString(fmt.Sprintf("summary: %q\n", summary))
	}
	sb.WriteString("---\n\n")
	sb.WriteString(content)

	if err := os.WriteFile(path, []byte(sb.String()), 0644); err != nil {
		return "", err
	}

	// Update Index (Master README and JSON)
	p.UpdateIndex()

	return filename, nil
}

func (p *WikiProcessor) UpdateIndex() error {
	return p.UpdateIndexWithEmbedder(nil)
}

func (p *WikiProcessor) UpdateIndexWithEmbedder(embedder func(string) ([]float64, error)) error {
	readmeFile := filepath.Join(p.BaseDir, "README.md")
	indexFile := filepath.Join(p.BaseDir, "index.json")
	blevePath := filepath.Join(p.BaseDir, "musu.bleve")
	vectorFile := filepath.Join(p.BaseDir, "musu.vectors.json")

	// Vector Store setup
	vstore := NewVectorStore()
	vstore.Load(vectorFile)

	// Bleve setup
	var index bleve.Index
	var err error
	if _, statErr := os.Stat(blevePath); os.IsNotExist(statErr) {
		mapping := bleve.NewIndexMapping()
		index, err = bleve.New(blevePath, mapping)
	} else {
		index, err = bleve.Open(blevePath)
	}
	if err != nil {
		return fmt.Errorf("failed to open bleve: %v", err)
	}
	defer index.Close()

	var sb strings.Builder
	sb.WriteString("# Musu Crawl Wiki Index\n\n")
	sb.WriteString("Automated knowledge repository.\n\n")

	var entries []IndexEntry

	// Search in wiki/projects/
	projectsDir := filepath.Join(p.BaseDir, "projects")
	if _, err := os.Stat(projectsDir); os.IsNotExist(err) {
		os.MkdirAll(projectsDir, 0755)
	}

	err = filepath.Walk(p.BaseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || filepath.Base(path) == "README.md" || filepath.Base(path) == "index.json" || strings.HasSuffix(path, ".bleve") || filepath.Base(path) == "musu.vectors.json" {
			return nil
		}
		if filepath.Ext(path) != ".md" {
			return nil
		}

		rel, _ := filepath.Rel(p.BaseDir, path)
		link := strings.ReplaceAll(rel, "\\", "/")

		// Parse frontmatter
		entry, docContent, _ := p.ParseFrontmatterWithContent(path, link)
		if entry != nil {
			entry.Content = docContent
			entries = append(entries, *entry)

			// Index to Bleve
			index.Index(entry.ID, entry)

			// Handle Vectors
			if embedder != nil {
				if _, exists := vstore.Embeddings[entry.ID]; !exists {
					fmt.Printf("🧠 Generating embedding for %s...\n", entry.ID)
					// Embed summary or title
					textToEmbed := entry.Summary
					if textToEmbed == "" {
						textToEmbed = entry.Title
					}
					vec, err := embedder(textToEmbed)
					if err == nil {
						vstore.Embeddings[entry.ID] = vec
					} else {
						fmt.Printf("   ⚠️  Embedding failed: %v\n", err)
					}
				}
			}

			sb.WriteString(fmt.Sprintf("* [%s](%s) [%s] (%s)\n", entry.Title, entry.Path, entry.Project, entry.Source))
		} else {
			name := strings.TrimSuffix(filepath.Base(path), ".md")
			sb.WriteString(fmt.Sprintf("* [%s](%s)\n", name, link))
		}

		return nil
	})

	if err != nil {
		return err
	}

	// Save README.md
	os.WriteFile(readmeFile, []byte(sb.String()), 0644)

	// Save index.json
	jsonData, _ := json.MarshalIndent(entries, "", "  ")
	return os.WriteFile(indexFile, jsonData, 0644)

	// Save vectors
	return vstore.Save(vectorFile)
}

func (p *WikiProcessor) ParseFrontmatterWithContent(path string, relPath string) (*IndexEntry, string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}

	content := string(data)
	if !strings.HasPrefix(content, "---") {
		return nil, "", fmt.Errorf("no frontmatter")
	}

	endIdx := strings.Index(content[3:], "---")
	if endIdx == -1 {
		return nil, "", fmt.Errorf("invalid frontmatter")
	}

	yamlPart := content[3 : endIdx+3]
	docContent := strings.TrimSpace(content[endIdx+6:])

	var meta struct {
		Title   string   `yaml:"title"`
		Source  string   `yaml:"source"`
		Project string   `yaml:"project"`
		ID      string   `yaml:"id"`
		Date    string   `yaml:"date"`
		Tags    []string `yaml:"tags"`
		Summary string   `yaml:"summary"`
	}

	if err := yaml.Unmarshal([]byte(yamlPart), &meta); err != nil {
		return nil, "", err
	}

	if meta.Project == "" {
		meta.Project = "default"
	}

	return &IndexEntry{
		ID:      meta.ID,
		Title:   meta.Title,
		Source:  meta.Source,
		Project: meta.Project,
		Path:    relPath,
		Date:    meta.Date,
		Tags:    meta.Tags,
		Summary: meta.Summary,
	}, docContent, nil
}

func sanitizeFilename(s string) string {
	re := regexp.MustCompile(`[<>:"/\\|?*]`)
	return re.ReplaceAllString(s, "_")
}
