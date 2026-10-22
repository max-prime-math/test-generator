# Gradebook Overview layout

Teacher task: open a section, review its grades immediately, then reveal assessment, weighting, or roster controls when needed without losing the current work.

The grade grid follows the existing filters in the central workspace. Overview's right pane is Section tools, with independent native disclosures for Assessments, Category weights, Roster, and Section management. All existing forms, assessment metadata, archive/Trash actions, imports, and policies remain available. Follow-up counts use the whole section roster and all assessments; their buttons apply the existing Missing or Ungraded filters without editing records. Empty sections offer direct Add students and Add assessment actions.

Disclosure state is an additive browser-local layout preference. Collapsing retains mounted forms and their input; hiding the rail retains the component's existing bound field values. No bank, test, assessment snapshot, grade, note, or saved-filter content changes as a consequence of layout operations. Adding an assessment still creates the same frozen assessment and opens Grading; the tools drawer closes and score entry receives focus. Errors preserve input in the open form.

On narrow screens the same tools appear in the existing drawer. Summary controls participate in its focus trap, Close stays available during scrolling, Escape restores the opener, and desktop hiding returns focus to the tools control. Details can be resized or hidden using the existing rails.

Validation: automated browser tasks check first-viewport access to grades with a 32-student/12-assessment section, native disclosure keyboard behavior, retained form input, local layout persistence, unchanged grade records, follow-up filter results, narrow-screen tool sizing, drawer focus/closing, external-assessment error recovery, and transition to mobile score entry. Existing gradebook regression suites cover the retained workflows. Screenshots are inspected at desktop and phone widths. No teacher usability observation has been performed.

Student view also moves its category totals and full categorized assessment list into the right pane, with independent Grade breakdown and Assessments disclosures. Per-assessment question expansion remains scoped to the chosen student. The central workspace retains the student picker, final grade, report action, editable roster record, enrollment controls, and notes. Grades & assessments opens this pane on desktop or in the narrow-screen drawer. The redundant sidebar category snapshot list is replaced by the complete category totals, including earned/possible marks and configured weights.

Limits: unsaved assessment/roster form input retains its existing lifetime and is not recovered after a page reload; collapse preferences are device-local. Grading retains its established layout.
