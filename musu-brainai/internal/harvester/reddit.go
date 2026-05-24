package harvester

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/yellowhama/musu-brainai/internal/utils"
)

type RedditFetcher struct{}

type RedditResponse struct {
	Kind string `json:"kind"`
	Data struct {
		Children []struct {
			Kind string `json:"kind"`
			Data struct {
				Title     string `json:"title"`
				Selftext  string `json:"selftext"`
				Author    string `json:"author"`
				Subreddit string `json:"subreddit"`
				Permalink string `json:"permalink"`
				URL       string `json:"url"`
			} `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

func (f *RedditFetcher) Fetch(url string) (string, string, error) {
	// Reddit JSON API usually works by appending .json to the URL
	jsonURL := strings.TrimRight(url, "/")
	if !strings.HasSuffix(jsonURL, ".json") {
		jsonURL += ".json"
	}

	// Reddit requires a unique User-Agent to avoid 429
	headers := map[string]string{
		"User-Agent": "Mozilla/5.0 musu-crawl-ai/0.1.0",
	}

	body, _, err := utils.GetWithRetry(jsonURL, headers)
	if err != nil {
		return "", "", fmt.Errorf("failed to fetch reddit data: %v", err)
	}

	// Reddit returns an array for comments or a single object for listings
	// We handle the basic thread/listing case
	if strings.HasPrefix(string(body), "[") {
		var resp []RedditResponse
		if err := json.Unmarshal(body, &resp); err != nil {
			return "", "", fmt.Errorf("failed to decode reddit array JSON: %v", err)
		}
		if len(resp) > 0 {
			return f.formatPost(resp[0])
		}
	} else {
		var resp RedditResponse
		if err := json.Unmarshal(body, &resp); err != nil {
			return "", "", fmt.Errorf("failed to decode reddit object JSON: %v", err)
		}
		return f.formatPost(resp)
	}

	return "", "", fmt.Errorf("no content found in reddit response")
}

func (f *RedditFetcher) formatPost(resp RedditResponse) (string, string, error) {
	if len(resp.Data.Children) == 0 {
		return "", "", fmt.Errorf("reddit response contains no data")
	}

	post := resp.Data.Children[0].Data
	title := post.Title

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# %s\n\n", post.Title))
	sb.WriteString(fmt.Sprintf("**Author:** u/%s | **Subreddit:** r/%s\n\n", post.Author, post.Subreddit))
	sb.WriteString("---\n\n")

	if post.Selftext != "" {
		sb.WriteString(post.Selftext)
	} else if post.URL != "" {
		sb.WriteString(fmt.Sprintf("External Link: %s", post.URL))
	}

	return title, sb.String(), nil
}
