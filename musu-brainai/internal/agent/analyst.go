package agent

import (
	"fmt"
)

type Analyst struct {
	Client        *OllamaClient
	CustomPersona string
}

func (a *Analyst) Synthesize(query string, contents []string) (string, error) {
	fullContext := ""
	for i, c := range contents {
		fullContext += fmt.Sprintf("--- Source %d ---\n%s\n\n", i+1, c)
		if len(fullContext) > 8000 { // Simple context window limit
			break
		}
	}

	prompt := fmt.Sprintf(`You are a Research Analyst for "musu-crawl-ai". 

%s

Below are several sources collected for the query: "%s"

Sources:
%s

Your task:
1. Synthesize a comprehensive answer based ONLY on the provided sources.
2. Identify any specific information that is still missing to fully answer the query.

Format your output as:
ANSWER: [Your synthesized response]
MISSING: [List of specific information gaps, or "None"]`, a.CustomPersona, query, fullContext)

	return a.Client.Ask(prompt, false)
}
