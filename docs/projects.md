# Projects
Using project-flagged tags is an elegant, highly flexible architecture. By using your existing tagging pipeline rather than creating a rigid parent-child folder table, you avoid complex tree-traversal logic while getting multi-homing for free—a document can easily belong to multiple projects if needed.

## Database Schema Pattern
Rather than putting a boolean flag directly on every tag instance, splitting the core tags definition from a projects metadata extension table keeps tag operations fast while giving you a clean home for project-specific fields.
• projects Table: tag_id (PK/FK), name, description, status (e.g., active, archived), due_date, custom_metadata (JSONB), created_at

Query Pattern:
-- Fetch left sidebar project navigation
SELECT t.id, t.name, t.slug, p.status, p.due_date
FROM tags t
JOIN projects p ON t.id = p.tag_id
ORDER BY t.name ASC;


## Tags integration
- once a Project tag is created it is inserted into the tags table, must be unique
- the tag can now be applied to any file to make that file part of the project


## Architectural Advantages
• Mixed File Support: Handles PDFs, images, code snippets, and notes seamlessly within the same unified view by querying WHERE tag_id = :project_tag_id.
• Zero-Migration Hierarchy: If a standard tag needs to "promote" to a project later, you simply insert a row into the projects table for that tag_id.
• Poly-Hierarchy: A file like contract.pdf can carry tags for Project Alpha, Legal, and Q3-2026 without duplicating storage references.

## Sidebar Integration
- Projects label above the categories list

## ProjectListView
- show the ProjectListView on the right column (similar to FileBrowser but listing projects)
- list all the active projects in the table
- provide an add icon to create a new project
- provide a search box (similar to FileBrowser)
- double click a project-row to show the ProjectView
- and an icon on the row to show the ProjectView

## ProjectView
- ProjectView: Treat a clicked project like a Smart Collection. Same as FileBrowser Files, but limited to rows that match the tag list from the project. The top header displays project metadata (name, status, due date, description), while the main grid displays all associated files with type-specific icons or filters, show the same category filters from the Files view.