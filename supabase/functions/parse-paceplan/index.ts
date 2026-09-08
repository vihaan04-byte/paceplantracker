const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { rows, month } = await req.json()
    const groqKey = Deno.env.get('GROQ_API_KEY')

    const systemPrompt = `You convert messy school "pace plan" spreadsheet rows into clean JSON.

Input: raw rows from one course's spreadsheet tab, already filtered down to just the header row(s) plus the weeks falling in one target month. Format varies — usually a header row, then one row per week with columns like Week Number, Dates, Assignments (often one big multi-line text blob), and Status. Some rows are break weeks (FALL BREAK, SPRING BREAK, NSO) — mark these with "isBreak": true instead of parsing tasks. Some rows have a blank Week Number, meaning they continue the previous week's assignments — merge them into that week. Emoji markers in the text (✅ = done, 🚩 or 🔷 = not done / flagged) indicate a task's completed status if present; otherwise use the row's own Status column.

Split each week's assignment blob into individual separate tasks. Some sheets structure this as: a line starting with a single asterisk (*) is a CATEGORY HEADER, not a task itself — it just labels the group; the actual required tasks are the "-" sub-bullets listed underneath it. Only emit those "-" sub-bullets as tasks, not the "*" header line itself. Separately, some sheets mark optional/"get ahead"/suggestion content with a double asterisk (**) or phrasing like "get ahead", "consider", "optional", "you might" — SKIP these entirely, do not include them as tasks at all.

Output ONLY valid JSON, no other text, in this exact shape:
{ "weeks": [ { "weekNumber": 1, "dateRange": "August 17 - 21", "isBreak": false, "tasks": [ { "text": "Complete Module 0", "done": true, "optional": false } ] } ] }`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: JSON.stringify(rows) }],
        temperature: 0.1, reasoning_effort: 'low', max_completion_tokens: 4096
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      return new Response(JSON.stringify({ error: `Groq error ${res.status}: ${errText}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await res.json()
    const choice = data.choices[0]
    const content = choice.message.content || choice.message.reasoning_content || ''
    if (!content.trim()) {
      return new Response(JSON.stringify({ error: `Empty response, finish_reason: ${choice.finish_reason}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const weeks = JSON.parse(content).weeks
    return new Response(JSON.stringify({ weeks }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})