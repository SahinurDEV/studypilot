// Demo data so StudyPilot runs without a Notion token. Dates are relative to today.

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sampleTasks() {
  return [
    { id: 's1', title: 'Calculus problem set 6', course: 'MATH 201', type: 'Assignment', due: inDays(1), status: 'In progress', priority: 'High', effortHours: 4, progress: 25 },
    { id: 's2', title: 'Data Structures midterm', course: 'CSE 220', type: 'Exam', due: inDays(4), status: 'Not started', priority: 'High', effortHours: 10, progress: 0 },
    { id: 's3', title: 'Physics lab report', course: 'PHY 110', type: 'Lab', due: inDays(2), status: 'Not started', priority: 'Medium', effortHours: 3, progress: 0 },
    { id: 's4', title: 'Read chapters 4-5', course: 'ENG 105', type: 'Reading', due: inDays(3), status: 'Not started', priority: 'Low', effortHours: 2, progress: 0 },
    { id: 's5', title: 'Group project prototype', course: 'CSE 220', type: 'Project', due: inDays(9), status: 'In progress', priority: 'High', effortHours: 14, progress: 30 },
    { id: 's6', title: 'Economics essay draft', course: 'ECO 101', type: 'Assignment', due: inDays(11), status: 'Not started', priority: 'Medium', effortHours: 6, progress: 0 },
    { id: 's7', title: 'Linear algebra quiz', course: 'MATH 201', type: 'Exam', due: inDays(8), status: 'Not started', priority: 'Medium', effortHours: 4, progress: 0 },
    { id: 's8', title: 'Club event budget sheet', course: 'Robotics Club', type: 'Project', due: inDays(-1), status: 'In progress', priority: 'Medium', effortHours: 2, progress: 50 },
    { id: 's9', title: 'History reading response', course: 'HIS 102', type: 'Assignment', due: inDays(17), status: 'Not started', priority: 'Low', effortHours: 3, progress: 0 },
    { id: 's10', title: 'Internship application: cover letter', course: 'Career', type: 'Project', due: inDays(6), status: 'Not started', priority: 'High', effortHours: 3, progress: 0 },
    { id: 's11', title: 'Chemistry worksheet', course: 'CHE 101', type: 'Assignment', due: inDays(-3), status: 'Done', priority: 'Low', effortHours: 2, progress: 100 },
  ];
}

module.exports = { sampleTasks, inDays };
