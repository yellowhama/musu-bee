package agent

import (
	"encoding/json"
	"fmt"
)

type Planner struct {
	Client        *OllamaClient
	CustomPersona string
}

type SearchPlan struct {
	Queries []string `json:"queries"`
	Reason  string   `json:"reason"`
}

func (p *Planner) CreatePlan(userQuery string) (*SearchPlan, error) {
	prompt := fmt.Sprintf(`You are a Research Planner for "musu-crawl-ai". 
Your goal is to take a vague user question and break it down into 3-5 specific, high-quality search queries.
Target platforms include YouTube, GitHub, Arxiv, Reddit, and the general web.

%s

User Question: %s

Output your response in strict JSON format:
{
  "queries": ["query 1", "query 2", ...],
  "reason": "short explanation of the strategy"
}`, p.CustomPersona, userQuery)

	response, err := p.Client.Ask(prompt, true)
	if err != nil {
		return nil, err
	}

	var plan SearchPlan
	if err := json.Unmarshal([]byte(response), &plan); err != nil {
		return nil, fmt.Errorf("failed to parse planner JSON: %v (response was: %s)", err, response)
	}

	return &plan, nil
}
