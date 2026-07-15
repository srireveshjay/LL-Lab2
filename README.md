# Linked Lists, Visually

A two-pane teaching tool: write linked-list code in **console.py** on the left,
watch nodes, wires, and pointer flags build themselves on **the board** on the right.

## What it understands

| You type | What happens |
|---|---|
| `New = Node(5)` | A new node appears (data cell `5`, wire to `None`), with a pointer flag `New`. |
| `head = New` | A `head` flag is planted on the same node. Any name works, not just `head`. |
| `New.next = New2` | The wire from `New` redraws to reach `New2`. |
| `New.next = None` | The wire redraws back to the ground/`None` symbol. |
| `curr = curr.next` | The `curr` flag slides one node down the wire. |
| `curr = curr.next.next` | Chains as many `.next` as you like in one line. |
| `while curr is not None:` | Loops the indented block until the pointer runs off the end. |
| `print(curr.data)` | Logs the value to the OUTPUT strip under the editor. |

The `class Node:` block is shown for reference but never "executed" — everything
below it is what actually drives the board. Lines starting with `#` are comments.

You can also **drag** any pointer flag onto a different node (or off into the
"unassigned" tray to set it to `None`), and drag a node's wire tip onto another
node to relink `.next` by hand — no code required.

Controls: **Step ▸** runs one statement at a time, **Run** plays automatically,
**Restart** rewinds, **↺ Example** reloads the starter program.

## Deploying on GitHub Pages

1. Push `index.html`, `style.css`, and `app.js` to a repo (root, or a `/docs` folder).
2. Repo → **Settings → Pages** → set the source branch/folder.
3. Your site is live at `https://<username>.github.io/<repo>/`.

No build step, no dependencies beyond a Google Fonts link — it's three static files.
