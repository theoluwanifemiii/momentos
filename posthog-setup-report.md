<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the MomentOS backend. A singleton `posthog-node` client was created at `backend/src/lib/posthog.ts` and imported across five route files. User identification (`posthog.identify`) is called on every successful login and registration so person profiles are populated. A global Express error middleware captures unhandled exceptions via `posthog.captureException`, and graceful shutdown hooks (`SIGTERM`/`SIGINT`) ensure all queued events are flushed before the process exits.

| Event | Description | File |
|---|---|---|
| `user_registered` | User successfully registered via email/password or magic link | `backend/src/routes/auth.ts` |
| `magic_link_requested` | User requested a magic link to sign in or register | `backend/src/routes/auth.ts` |
| `magic_link_verified` | User successfully verified a magic link and logged in | `backend/src/routes/auth.ts` |
| `user_logged_in` | User successfully logged in with email and password | `backend/src/routes/auth.ts` |
| `email_verified` | User successfully verified their email address | `backend/src/routes/auth.ts` |
| `password_reset` | User successfully reset their password | `backend/src/routes/auth.ts` |
| `waitlist_signup` | Anonymous visitor signed up to the waitlist | `backend/src/routes/auth.ts` |
| `moment_created` | A new moment (broadcast or personal) was created | `backend/src/routes/Moments.ts` |
| `moment_updated` | An existing moment was updated | `backend/src/routes/Moments.ts` |
| `moment_deleted` | A moment was deleted | `backend/src/routes/Moments.ts` |
| `moment_status_changed` | A moment's status was changed (e.g. ACTIVE → PAUSED) | `backend/src/routes/Moments.ts` |
| `person_added` | A person was manually added to the organization | `backend/src/routes/People.ts` |
| `people_csv_uploaded` | A CSV file was uploaded to bulk-import people | `backend/src/routes/People.ts` |
| `birthday_email_sent` | A birthday email was manually sent to a person | `backend/src/routes/People.ts` |
| `birthday_sms_sent` | A birthday SMS was manually sent to a person | `backend/src/routes/People.ts` |
| `settings_updated` | Organization settings were updated | `backend/src/routes/Settings.ts` |
| `feedback_submitted` | User submitted feedback (bug report, feature request, or suggestion) | `backend/src/routes/Feedback.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](/dashboard/1588172)
- [User Signups Over Time](/insights/IGy7IgGj)
- [Moments Created Over Time](/insights/MF6JWU1A)
- [Signup to First Moment Funnel](/insights/5bpdrF6Z) — conversion funnel from registration to first moment created
- [Birthday Messages Sent](/insights/r9n5P7C0) — email and SMS messages sent manually
- [Waitlist Signups Over Time](/insights/OgRIdH6H)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
