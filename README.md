MomentOS 🎉

Automated Birthday Emails for Teams, Churches, and Organizations

MomentOS is a lightweight, open-source tool that helps organizations send personalized birthday emails automatically — without chasing designers, spreadsheets, or reminders.

Upload your people once, choose a template, and MomentOS handles the rest.

Built with clarity over complexity. Designed for real-world teams.

⸻

✨ Why MomentOS Exists

In many teams, birthdays are handled manually:
	•	HR chasing designers
	•	Spreadsheets that go out of sync
	•	Missed birthdays
	•	Last-minute rushes

MomentOS removes all that friction.

It’s built for:
	•	Churches
	•	Startups
	•	SMEs
	•	NGOs
	•	Remote teams
	•	Any organization that values people but hates busy work

⸻

🚀 What MomentOS Does (v1)

Authentication & Users
	•	Register and login
	•	Email verification via OTP
	•	Password reset via OTP

Organization Management
	•	Timezone configuration
	•	Custom email sender settings
	•	Configurable send time per organization

People Management
	•	CSV upload with strong validation
	•	Manual add (single person)
	•	Upcoming birthdays view (next 30 days)
	•	Manual birthday send
	•	CSV export
	•	Bulk delete
	•	Bulk opt-out

Email Templates
	•	Create, edit, delete templates
	•	Preview rendered emails
	•	Test-send templates
	•	Default template seeding
	•	Activate or deactivate templates
	•	Set default template

Email Delivery
	•	Resend integration
	•	Delivery logs dashboard
	•	Filter by status and date
	•	Retry failed emails
	•	Export delivery logs

Scheduler
	•	Daily automated birthday sends
	•	Organization timezone awareness
	•	Custom send time
	•	Admin reminders (2 days before)
	•	Manual trigger support

Admin Dashboard
	•	Overview stats
	•	Recent activity feed
	•	Paginated delivery logs
	•	Filters and exports

User Experience
	•	Onboarding checklist
	•	Guided setup modal
	•	Clear dashboard navigation

⸻

🧠 Design Philosophy
	•	Clarity over beauty
	•	Operational tools should feel calm
	•	Good enough beats perfect
	•	If it doesn’t work on slow internet, it doesn’t work

MomentOS is intentionally simple. We ship fast, learn quickly, and remove features that don’t serve users.

⸻

🏗️ Technical Overview

Frontend
	•	Web-based (no App Router)
	•	React
	•	Tailwind CSS
	•	Server-side rendered where needed

Backend
	•	Node.js
	•	REST APIs
	•	Background worker for scheduling

Email
	•	Resend
	•	Custom sender domains supported
	•	Delivery logging + retries

Scheduler
	•	Independent worker process
	•	Timezone-aware execution

Storage
	•	Database-backed OTPs, users, people, templates
	•	Expiry and attempt limits enforced

⸻

🔐 Privacy & Data Handling

MomentOS handles personally identifiable information (PII).

We take this seriously:
	•	Clear data ownership (you own your data)
	•	Ability to delete people and organizations
	•	GDPR-friendly data deletion
	•	Designed for self-hosting
	•	No hidden tracking

⸻

📄 CSV Format

Required columns:
	•	full_name
	•	email
	•	birthday (YYYY-MM-DD recommended)

Supported:
	•	Duplicate handling
	•	Mixed date formats
	•	Validation with clear error messages

A sample CSV is available in /examples.

⸻

🧩 What’s Explicitly Out (v1)
	•	Slack / WhatsApp notifications
	•	Work anniversaries
	•	Multi-language support
	•	Advanced analytics dashboards

These may come later — but not now.

⸻

🌍 Who This Is For

MomentOS works best if:
	•	You care about people
	•	You want consistency
	•	You hate manual workflows
	•	You want something that just works

⸻

🤝 Contributing

MomentOS is open source and community-driven.

Ways to contribute:
	•	Bug fixes
	•	CSV edge cases
	•	Template improvements
	•	Documentation
	•	UI clarity improvements

PRs welcome.

⸻

🧠 Inspiration

MomentOS started from a simple church problem:

“Why do we keep chasing designers for birthday flyers?”

It grew into a system that helps organizations show care — automatically.

⸻

📜 License

MIT License

⸻

💬 Final Note

MomentOS isn’t trying to be everything.

It’s trying to do one thing well:
Help organizations celebrate people — without stress.
