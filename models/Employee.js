class Employee {
  constructor(name, email, role, dept, status, createdAt) {
    this.name = name;
    this.email = email;
    this.role = role;
    this.dept = dept;
    this.status = status || "Active";
    this.createdAt = createdAt || new Date();
  }
}

module.exports = Employee;
