use musu_rs::writer::runner::TaskUpdate;

fn main() {
    let update = TaskUpdate {
        task_id: "test-task-1234",
        status: "done",
        company_id: Some("AISAAK"),
        channel: Some("engineering"),
        sender_id: Some("test-user"),
        prompt: Some("Please analyze the crawler architecture."),
        output: Some("The architecture is highly concurrent and uses Bleve for semantic search."),
        error: None,
        assigned_pc: Some("PC-1"),
        exit_code: Some(0),
        duration_sec: Some(1.23),
        created_at: None,
        started_at: None,
    };

    println!("Saving TaskUpdate...");
    update.save();
    println!("Saved successfully.");
}
