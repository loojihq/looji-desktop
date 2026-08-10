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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:workmaster.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
