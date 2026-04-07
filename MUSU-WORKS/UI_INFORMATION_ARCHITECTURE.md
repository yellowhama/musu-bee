# MUSU-WORKS UI Information Architecture

## 목표

회사와 프로젝트 운영 모델을 화면 구조로 내리고, 이후 실제 앱 UI나 mock UI로 옮길 수 있는 정보 구조를 고정한다.

## 설계 원칙

- 회사 화면은 "운영 본부"처럼 보여야 한다.
- 프로젝트 화면은 "실행 현장"처럼 보여야 한다.
- 회사와 프로젝트는 같은 정보 밀도를 가지지 않는다.
- org chart와 approvals queue는 회사 레벨에서 가장 먼저 보여야 한다.
- project view는 attached agents, pipeline, outputs 중심이어야 한다.

## 최상위 navigation

### 전역

- company switcher
- global search
- approvals indicator
- notifications
- activity feed shortcut

### 1차 navigation

- Companies
- Projects
- Approvals
- Policies
- Capabilities
- Activity

## 회사 화면 구조

### Company Overview

첫 화면 블록은 아래 순서가 맞다.

1. company header
2. org health strip
3. approvals queue
4. active projects
5. capability summary
6. recent activity

### Company Header

- company name
- mission
- status
- number of active agents
- number of active projects
- approval backlog count

### Org Health Strip

- active agents
- idle agents
- pending hires
- blocked approvals
- high-risk projects

### Approvals Queue

- pending count
- urgent count
- top 5 approval items
- action shortcuts

### Active Projects

- project name
- status
- attached agents
- current pipeline stage
- latest output summary

### Capability Summary

- available model providers
- enabled MCP/tool packs
- policy profiles
- reusable playbooks

### Recent Activity

- hiring
- policy changes
- approval resolutions
- project run events

## 회사 상세 하위 화면

### Org Chart

- CEO root
- manager nodes
- worker/specialist leaves
- pending hire placeholders
- reporting lines

필수 상호작용:

- node click -> agent drawer
- subtree filter
- status filter

### Agent Roster

- table view
- role filter
- status filter
- company team filter
- attached project count

### Policies

- policy profile list
- default policy
- override candidates
- risk classification summary

### Capabilities

- models
- tools
- MCP servers
- internal skills
- playbooks

## 프로젝트 화면 구조

### Project Overview

첫 화면 블록은 아래 순서가 맞다.

1. project header
2. pipeline state
3. attached agents
4. work queue
5. outputs
6. project memory
7. audit stream

### Project Header

- project name
- company
- workspace root
- repo binding
- status
- risk level

### Pipeline State

- current stage
- blocked stage
- latest run
- next activation candidates

### Attached Agents

- project role
- current task
- status
- escalation flag

### Work Queue

- queued tasks
- running tasks
- blocked tasks
- approval-waiting tasks

### Outputs

- latest deliverables
- artifacts
- summaries
- screenshots / logs / docs

### Project Memory

- project decisions
- requirements
- runbook
- local conventions

### Audit Stream

- approvals
- task transitions
- policy denials
- deploy-related events

## 정보 우선순위

### 회사에서 중요한 것

1. approvals
2. org state
3. active projects
4. capability health
5. activity

### 프로젝트에서 중요한 것

1. current execution state
2. attached agents
3. blocking approvals
4. outputs
5. memory / audit

## 모바일/좁은 폭 대응

- company overview는 header -> approvals -> projects -> activity 순으로 접힌다
- org chart는 tree 대신 level-grouped list fallback이 필요하다
- project view는 pipeline state를 먼저 보여주고, agent/output/memory는 tabs로 접는 게 맞다

## self-MCP 친화 설계 규칙

- block id가 안정적이어야 한다
- approval item은 action id가 고정돼야 한다
- org chart node는 stable agent key를 보여줘야 한다
- project header에는 workspace root와 project key가 명시돼야 한다
- pipeline stage는 text summary와 structured state를 같이 가져야 한다

## 현재 결론

회사 화면은 `승인 + 조직 + 프로젝트 운영`을 중심으로, 프로젝트 화면은 `실행 + 에이전트 배치 + 산출물`을 중심으로 설계해야 한다.
