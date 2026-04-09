# Pack Spec

## Purpose

Define what MUSU sells as a `pack`.

A pack is not just a prompt or a template.
A pack is a packaged operating scenario that can be installed, updated, validated, and run.

## Pack definition

A MUSU pack contains:
- workflow definition
- role / agent assignment
- required tools / adapters
- policy / approval defaults
- verification commands
- artifact expectations
- install / update metadata

In other words:

**A pack is a living operating bundle, not a static JSON preset.**

## Minimum pack structure

Each pack should define:
- `pack_id`
- `title`
- `version`
- `summary`
- `target_use_case`
- `required_capabilities`
- `workflow_steps`
- `agent_roles`
- `approval_policy`
- `verification_commands`
- `expected_artifacts`
- `upgrade_notes`

## Pack categories

Suggested categories:
- content factory
- listing/back-office operations
- research and collection
- coding / build / QA
- media processing
- customer operations

## Install contract

Installing a pack should:
- register required workflow definitions
- validate required adapters / tools
- surface missing capabilities
- expose a clear entry point in CLI/MCP/Web GUI

## Update contract

Updating a pack should:
- preserve user data where possible
- show behavior-changing diffs
- require acknowledgement for breaking policy changes

## Quality bar

A sellable pack should include:
- a clear success condition
- at least one verification path
- explicit expected artifacts
- explicit failure / exception routing

## Examples

Candidate official packs:
- product listing factory
- card-news factory
- blog/newsletter factory
- research collection pack
- image processing pipeline

