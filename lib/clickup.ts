// Creates triage tasks in ClickUp. Configure in Vercel:
//   CLICKUP_API_TOKEN        personal API token (pk_...) of the posting user
//   CLICKUP_PITCHES_LIST_ID  list the pitches land in
// https://clickup.com/api/clickupreference/operation/CreateTask/
const RESPONSE_TARGET_DAYS = 7;

export type ClickUpResult = { id: string } | { error: string };

export async function createPitchTask(task: { name: string; markdown: string }): Promise<ClickUpResult> {
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_PITCHES_LIST_ID;
  if (!token || !listId) return { error: "ClickUp not configured" };

  try {
    const res = await fetch(`https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: task.name,
        markdown_description: task.markdown,
        due_date: Date.now() + RESPONSE_TARGET_DAYS * 24 * 60 * 60 * 1000,
        due_date_time: false,
      }),
    });
    if (!res.ok) return { error: `ClickUp ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const { id } = await res.json();
    return { id };
  } catch (error) {
    return { error: `ClickUp request failed: ${String(error)}` };
  }
}
