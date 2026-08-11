use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_members",
            sql: "CREATE TABLE IF NOT EXISTS members (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL DEFAULT '',
                color TEXT NOT NULL DEFAULT 'bg-indigo-500',
                online INTEGER NOT NULL DEFAULT 1
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_projects",
            sql: "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'planning',
                progress INTEGER NOT NULL DEFAULT 0,
                due TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'indigo'
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_project_members",
            sql: "CREATE TABLE IF NOT EXISTS project_members (
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                PRIMARY KEY (project_id, member_id)
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_tasks",
            sql: "CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                assignee_id TEXT REFERENCES members(id) ON DELETE SET NULL,
                status TEXT NOT NULL DEFAULT 'backlog',
                priority TEXT NOT NULL DEFAULT 'medium',
                due TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]'
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_activities",
            sql: "CREATE TABLE IF NOT EXISTS activities (
                id TEXT PRIMARY KEY,
                member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                target TEXT NOT NULL,
                time TEXT NOT NULL
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_settings",
            sql: "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_audit_log",
            sql: "CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                action TEXT NOT NULL,
                summary TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '{}',
                time TEXT NOT NULL
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "migrate_activities_to_audit_log",
            sql: "INSERT INTO audit_log (id, entity_type, entity_id, action, summary, details, time) SELECT id, 'activity', '', action, target, '{}', time FROM activities",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "drop_activities",
            sql: "DROP TABLE activities",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_tasks_updated_at",
            sql: "ALTER TABLE tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_projects_spec",
            sql: "ALTER TABLE projects ADD COLUMN spec TEXT NOT NULL DEFAULT ''",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_projects_user_stories",
            sql: "ALTER TABLE projects ADD COLUMN user_stories TEXT NOT NULL DEFAULT '[]'",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "add_tasks_description",
            sql: "ALTER TABLE tasks ADD COLUMN description TEXT NOT NULL DEFAULT ''",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "add_tasks_estimate",
            sql: "ALTER TABLE tasks ADD COLUMN estimate REAL NOT NULL DEFAULT 0",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "add_tasks_sort_order",
            sql: "ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "create_ai_drafts",
            sql: "CREATE TABLE IF NOT EXISTS ai_drafts (
                project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
                draft TEXT NOT NULL DEFAULT 'null',
                desires TEXT NOT NULL DEFAULT '',
                due TEXT NOT NULL DEFAULT '',
                specialties TEXT NOT NULL DEFAULT '[]',
                included TEXT NOT NULL DEFAULT '{}',
                specialty TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL DEFAULT ''
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "add_projects_work_start",
            sql: "ALTER TABLE projects ADD COLUMN work_start INTEGER NOT NULL DEFAULT 540",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "add_projects_work_end",
            sql: "ALTER TABLE projects ADD COLUMN work_end INTEGER NOT NULL DEFAULT 1020",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "add_projects_work_days",
            sql: "ALTER TABLE projects ADD COLUMN work_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]'",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "add_tasks_original_due",
            sql: "ALTER TABLE tasks ADD COLUMN original_due TEXT NOT NULL DEFAULT ''",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "create_task_explanations",
            sql: "CREATE TABLE IF NOT EXISTS task_explanations (
                task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
                messages TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL DEFAULT ''
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "default_board_statuses_to_four",
            sql: r#"UPDATE settings SET value = '["todo","in_progress","in_review","done"]' WHERE key = 'boardStatuses' AND value = '["todo","in_progress","done"]'"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "add_projects_repo_path",
            sql: "ALTER TABLE projects ADD COLUMN repo_path TEXT NOT NULL DEFAULT ''",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "create_repo_index",
            sql: "CREATE TABLE IF NOT EXISTS repo_index (
                project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
                root TEXT NOT NULL DEFAULT '',
                files TEXT NOT NULL DEFAULT '[]',
                symbols TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL DEFAULT ''
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "create_workspaces",
            sql: "CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT ''
            );
            ALTER TABLE projects ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
            ALTER TABLE members ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
            CREATE TABLE IF NOT EXISTS workspace_settings (
                workspace_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (workspace_id, key)
            );
            INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES ('default', COALESCE((SELECT json_extract(value, '$') FROM settings WHERE key = 'workspaceName'), 'My workspace'), '');
            INSERT INTO workspace_settings (workspace_id, key, value) SELECT 'default', key, value FROM settings WHERE key IN ('workspaceName','timezone','boardStatuses','autoEscalate','notifAssignments','notifDigest','notifMentions','notifProduct');
            UPDATE projects SET workspace_id = 'default' WHERE workspace_id = '';
            UPDATE members SET workspace_id = 'default' WHERE workspace_id = '';
            DELETE FROM settings WHERE key IN ('workspaceName','timezone','boardStatuses','autoEscalate','notifAssignments','notifDigest','notifMentions','notifProduct')",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "workspace_icons_and_scoped_audit",
            sql: "ALTER TABLE workspaces ADD COLUMN icon_color TEXT NOT NULL DEFAULT 'indigo';
            ALTER TABLE workspaces ADD COLUMN icon_emoji TEXT NOT NULL DEFAULT '';
            ALTER TABLE audit_log ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
            UPDATE audit_log SET workspace_id = 'default' WHERE workspace_id = ''",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "workspace_image_icon",
            sql: "ALTER TABLE workspaces ADD COLUMN icon TEXT NOT NULL DEFAULT ''",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:workmaster.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
