package processor

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type TaskState struct {
	TaskID         string   `json:"task_id"`
	CompanyID      string   `json:"company_id"`
	Channel        string   `json:"channel"`
	SenderID       string   `json:"sender_id"`
	Prompt         string   `json:"prompt"`
	Status         string   `json:"status"` // pending, running, completed, failed
	Output         string   `json:"output,omitempty"`
	Error          string   `json:"error,omitempty"`
	AssignedPC     string   `json:"assigned_pc,omitempty"`
	CreatedAt      int64    `json:"created_at"`
	StartedAt      int64    `json:"started_at,omitempty"`
	UpdatedAt      int64    `json:"updated_at,omitempty"`
	DurationSec    float64  `json:"duration_sec,omitempty"`
	ExitCode       int      `json:"exit_code,omitempty"`
}

type TaskManager struct {
	BaseDir string
}

func NewTaskManager(baseDir string) *TaskManager {
	return &TaskManager{BaseDir: baseDir}
}

// getTasksDir returns the canonical path to the tasks folder.
func (m *TaskManager) getTasksDir() string {
	if home, err := os.UserHomeDir(); err == nil {
		musuHome := filepath.Join(home, ".musu")
		if h := os.Getenv("MUSU_HOME"); h != "" {
			musuHome = h
		}
		return filepath.Join(musuHome, "tasks")
	}
	return filepath.Join(m.BaseDir, "tasks")
}

// SaveTask serializes a task state to a JSON file in {baseDir}/tasks/{task_id}.json.
func (m *TaskManager) SaveTask(task *TaskState) error {
	dir := m.getTasksDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create tasks directory: %w", err)
	}

	task.UpdatedAt = time.Now().Unix()

	path := filepath.Join(dir, fmt.Sprintf("%s.json", task.TaskID))
	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal task: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write task file: %w", err)
	}

	return nil
}

// GetTask deserializes a task from the corresponding JSON file.
func (m *TaskManager) GetTask(taskID string) (*TaskState, error) {
	path := filepath.Join(m.getTasksDir(), fmt.Sprintf("%s.json", taskID))
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("task %s not found: %w", taskID, os.ErrNotExist)
		}
		return nil, fmt.Errorf("failed to read task file: %w", err)
	}

	var task TaskState
	if err := json.Unmarshal(data, &task); err != nil {
		return nil, fmt.Errorf("failed to unmarshal task json: %w", err)
	}

	return &task, nil
}

// ListTasks returns all tasks ordered by creation time descending.
func (m *TaskManager) ListTasks() ([]TaskState, error) {
	dir := m.getTasksDir()
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return []TaskState{}, nil
	}

	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("failed to read tasks directory: %w", err)
	}

	var tasks []TaskState
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".json") {
			continue
		}

		taskID := strings.TrimSuffix(f.Name(), ".json")
		task, err := m.GetTask(taskID)
		if err != nil {
			// Skip corrupt or invalid task files
			continue
		}
		tasks = append(tasks, *task)
	}

	// Sort by CreatedAt descending
	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].CreatedAt > tasks[j].CreatedAt
	})

	return tasks, nil
}

// ListTasksByCompany filters tasks by company_id.
func (m *TaskManager) ListTasksByCompany(companyID string) ([]TaskState, error) {
	all, err := m.ListTasks()
	if err != nil {
		return nil, err
	}

	var filtered []TaskState
	for _, t := range all {
		if t.CompanyID == companyID {
			filtered = append(filtered, t)
		}
	}
	return filtered, nil
}
