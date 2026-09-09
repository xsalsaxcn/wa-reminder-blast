# Notiva - Jotform AI Agent Setup

This patch adds a dedicated **AI Assistant** page to Notiva without changing the existing Chatbot FAQ, WhatsApp sending, Meta webhook, Reminder, Blast, Inbox, scheduler, worker, or database schema.

## 1. Create / open the Jotform AI Agent

In Jotform AI Agent Builder, train the agent with Notiva support content such as:

- Notiva User Guide
- Reminder workflow
- WhatsApp Blast / Template Blast workflow
- Inbox and Quick Reply workflow
- Job Performance and Usage Log guide
- Troubleshooting and escalation SOP

Recommended mode for the first deployment: **support / assist only**. Do not connect the production WABA directly to Jotform in this phase.

## 2. Get the Agent ID

Open the agent in Jotform:

1. Go to **Publish**.
2. Open **Chatbot** or the embed option.
3. Click **Copy Code**.
4. Find the Agent ID in the embed URL. Example:

```html
<script src="https://cdn.jotfor.ms/agent/embedjs/019xxxxxxxxxxxxxxxxxxxxxxxxxxxx/embed.js"></script>
```

The Agent ID is the long value between `/embedjs/` and `/embed.js`.

## 3. Configure Vercel

Add this Environment Variable to the Notiva Vercel project:

```text
NEXT_PUBLIC_JOTFORM_AI_AGENT_ID=019xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Optional display title:

```text
NEXT_PUBLIC_JOTFORM_AI_AGENT_TITLE=Notiva AI Assistant
```

Alternative if you prefer to provide the direct agent URL:

```text
NEXT_PUBLIC_JOTFORM_AI_AGENT_URL=https://agent.jotform.com/019xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

If both ID and URL are set, the URL is used.

After changing Vercel environment variables, redeploy the project.

## 4. Test

Open **AI Assistant** from the Notiva sidebar and verify:

- The agent loads inside Notiva.
- Questions can be asked normally.
- Existing Reminder / Blast / Inbox functions remain unchanged.
- The existing **Chatbot FAQ** admin page remains available separately.

## Security scope of Patch 06

The Jotform Agent is embedded as an isolated iframe. Patch 06 does **not** expose Supabase service-role credentials, does not create a database migration, and does not give Jotform direct write access to Notiva.

Live Notiva data/API tools can be added later as a separate read-only phase after this embed is verified stable.
