package cmd

import (
	"github.com/spf13/cobra"
)

const Version = "v0.4.0"

var rootCmd = &cobra.Command{
	Use:     "musu-crawl-ai",
	Short:   "AI-Ready Knowledge Harvester & Wiki Generator",
	Long:    `A high-performance crawler to fetch and organize content for AI.`,
	Version: Version,
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	// Root flags if needed
}
