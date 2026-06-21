def validate_schedule_logic(tasks: list) -> list:
    errors = []
    for task in tasks:
        if task.get('end_date') < task.get('start_date'):
            errors.append(f"Tugas {task.get('name')} selesai sebelum dimulai")
    return errors
