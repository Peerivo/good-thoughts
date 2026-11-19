#!/usr/bin/env python3
"""Bounded owner-only Notify bridge. Install a reviewed, root-owned copy OUTSIDE the public Git checkout."""
import argparse
import json
import re
import sqlite3
import subprocess
import time
from pathlib import Path

REPO = "Peerivo/notify"
NOTIFY_PREFIX = "[notify:telegram]"
DB_DEFAULT = "/var/lib/peerivo-good-thoughts/good-thoughts.sqlite"

def gh(*args):
    run = subprocess.run(["/usr/bin/gh", *args], capture_output=True, text=True, timeout=22, check=True)
    return run.stdout.strip()

def notice_text(event):
    kind = event["kind"]
    suffix = "готов черновик ответа, нужно утверждение" if kind.startswith("draft_v") else "новый подтверждённый вопрос"
    marker = "dm-notice:" + event["id"]
    title = f"{NOTIFY_PREFIX} ДМ: {suffix} [{marker}]"
    body = (
        "Фабрика добрых мыслей (dobro.peerivo.net): " + suffix + ".\n\n"
        "Действие: открыть безопасную внутреннюю очередь в ChatGPT/на сервере, "
        "прочитать оригинальный вопрос и черновик, одобрить или вернуть на доработку.\n"
        "НИКАКИХ автоматических ответов клиенту без явного решения владельца.\n"
        "Полный текст вопроса, email, личные данные и текст ответа в Issue НЕ передаются.\n"
        f"Идентификатор события: {marker}\n"
    )
    return title, body

def find_issue(event):
    result = json.loads(gh("issue", "list", "--repo", REPO,
                           "--state", "all", "--search", event["id"],
                           "--json", "number,title", "--limit", "50") or "[]")
    matches = [i for i in result
               if ("dm-notice:" + event["id"]) in i.get("title", "")]
    if len(matches) > 1:
        raise RuntimeError("duplicate_issue_ambiguous")
    return matches[0]["number"] if matches else None

def mark(conn, event_id, state, issue_number=None):
    conn.execute(
        "UPDATE owner_notifications SET status=?,issue_number=?,sent_at=? WHERE id=? AND status IN ('pending','attempting','uncertain')",
        (state, issue_number, int(time.time() * 1000) if state == "submitted" else None, event_id)
    )
    conn.commit()

def dispatch(db_path, dry_run=False):
    if not Path(db_path).is_file():
        raise RuntimeError("database_not_found")
    conn = sqlite3.connect(db_path, timeout=4)
    conn.row_factory = sqlite3.Row
    submitted = 0
    uncertain = 0
    try:
        rows = [dict(r) for r in conn.execute(
            "SELECT id,kind,status FROM owner_notifications "
            "WHERE status IN ('pending','attempting','uncertain') ORDER BY created_at LIMIT 12")]
        if dry_run:
            return {"pendingOrUncertain": len(rows), "submitted": 0, "uncertain": 0, "dryRun": True}
        if not rows:
            return {"pendingOrUncertain": 0, "submitted": 0, "uncertain": 0}
        # Must be the private internal owner Notify, NEVER public repository or direct Telegram.
        status = json.loads(gh("repo", "view", REPO, "--json", "isPrivate"))
        if status.get("isPrivate") is not True:
            raise RuntimeError("owner_notify_repo_is_not_private")
        for row in rows:
            try:
                existing = find_issue(row)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired, RuntimeError, json.JSONDecodeError):
                uncertain += 1
                continue
            if existing is not None:
                mark(conn, row["id"], "submitted", existing)
                submitted += 1
                continue
            if row["status"] != "pending":
                uncertain += 1  # Any earlier attempt could have reached GitHub; never resend.
                continue
            # Claim before any effect: a crash during create cannot create duplicate issue on recovery.
            changed = conn.execute("UPDATE owner_notifications SET status='attempting' WHERE id=? AND status='pending'", (row["id"],))
            conn.commit()
            if changed.rowcount != 1:
                continue
            title, body = notice_text(row)
            try:
                url = gh("issue", "create", "--repo", REPO, "--title", title, "--body", body)
                found = re.search(r"/issues/(\d+)$", url)
                if not found:
                    mark(conn, row["id"], "uncertain")
                    uncertain += 1
                    continue
                mark(conn, row["id"], "submitted", int(found.group(1)))
                submitted += 1
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                mark(conn, row["id"], "uncertain")
                uncertain += 1
        return {"pendingOrUncertain": len(rows), "submitted": submitted, "uncertain": uncertain}
    finally:
        conn.close()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=DB_DEFAULT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    result = dispatch(args.db, args.dry_run)
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()
