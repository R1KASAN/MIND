---
version: alpha
name: MIND
description: Room-based AI workbench for turning messy client/project context into one next action.

colors:
  background: "#181818"
  surface: "#202124"
  surface-muted: "#2A2B31"
  border: "#3A3D4F"
  text: "#F5F5F5"
  text-muted: "#A0AEC0"
  primary: "#5B5FE8"
  primary-text: "#FFFFFF"
  accent: "#8B8CF6"

typography:
  body-th:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: 0
  metadata:
    fontFamily: system-ui
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: 0
  breadcrumb:
    fontFamily: system-ui
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  card-title:
    fontFamily: system-ui
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: 0

rounded:
  sm: 4px
  md: 8px

spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.md}"
    typography: "{typography.body-th}"
    padding: 16px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    typography: "{typography.body-th}"
    padding: 14px
  tertiary-link:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-muted}"
    typography: "{typography.metadata}"
    rounded: "{rounded.sm}"
    padding: 8px
  metadata-pill:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-muted}"
    typography: "{typography.metadata}"
    rounded: "{rounded.sm}"
    padding: 8px
  rescue-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 16px
  scaffold-quote:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 16px
  divider:
    backgroundColor: "{colors.border}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 8px
  focus-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.background}"
    rounded: "{rounded.sm}"
    padding: 8px
  sticky-cta:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 16px
---

## Overview
MIND should feel like a focused workbench, not a landing page. The interface should help a user keep one Room, one context, and one next action clear.

## Layout
Desktop uses available width purposefully with a room/history sidebar and a readable active work panel. Mobile prioritizes one-column focus, safe-area CTAs, and readable Thai text.

## Components
Primary actions must be visually dominant. Metadata, evidence links, and recovery controls should remain visible without competing with the main CTA.

## Do's and Don'ts
Do use restrained spacing, clear hierarchy, and Thai-readable line-height.
Do not change product logic, prompts, retrieval, persistence, analytics, OCR, or orchestrator behavior during visual polish.
