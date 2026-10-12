/**
 * SchemaShift - Preloaded Demonstration Datasets
 * Based on BCSE406L Review 2 baseline examples.
 */

export const DEMO_EXAMPLES = [
  {
    id: "student_course",
    title: "1. Student ↔ Course (N:M)",
    description: "Many-to-Many junction relationship. Demonstrates embedding relationship attributes into Student with reference to Course.",
    schema: `CREATE TABLE Student (
    student_id INT PRIMARY KEY,
    name VARCHAR(100)
);

CREATE TABLE Course (
    course_id INT PRIMARY KEY,
    course_name VARCHAR(100)
);

CREATE TABLE Enrollment (
    student_id INT,
    course_id INT,
    semester VARCHAR(20),
    FOREIGN KEY (student_id) REFERENCES Student(student_id),
    FOREIGN KEY (course_id) REFERENCES Course(course_id)
);`,
    queries: `SELECT s.name, c.course_name
FROM Student s
JOIN Enrollment e
    ON s.student_id = e.student_id
JOIN Course c
    ON e.course_id = c.course_id
WHERE s.student_id = 101;

SELECT *
FROM Course
WHERE course_id = 10;`,
    sampleData: {
      Student: [
        { student_id: 101, name: "Alice Johnson" },
        { student_id: 102, name: "Bob Smith" },
        { student_id: 103, name: "Charlie Brown" }
      ],
      Course: [
        { course_id: 10, course_name: "NoSQL Databases" },
        { course_id: 20, course_name: "Distributed Systems" },
        { course_id: 30, course_name: "Cloud Computing" }
      ],
      Enrollment: [
        { student_id: 101, course_id: 10, semester: "Fall 2024" },
        { student_id: 101, course_id: 20, semester: "Spring 2025" },
        { student_id: 102, course_id: 10, semester: "Fall 2024" },
        { student_id: 103, course_id: 30, semester: "Fall 2024" }
      ]
    }
  },

  {
    id: "customer_orders",
    title: "2. Customer → Orders (1:N Embed)",
    description: "One-to-Many relationship frequently co-accessed. Demonstrates embedding orders array into Customer without duplicating Orders collection.",
    schema: `CREATE TABLE Customer (
    customer_id INT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100)
);

CREATE TABLE Orders (
    order_id INT PRIMARY KEY,
    customer_id INT,
    order_date DATE,
    amount DECIMAL(10,2),
    FOREIGN KEY (customer_id) REFERENCES Customer(customer_id)
);`,
    queries: `SELECT c.name, o.order_id, o.amount
FROM Customer c
JOIN Orders o
    ON c.customer_id = o.customer_id
WHERE c.customer_id = 101;`,
    sampleData: {
      Customer: [
        { customer_id: 101, name: "Diana Prince", email: "diana@themyscira.io" },
        { customer_id: 102, name: "Bruce Wayne", email: "bruce@wayne-enterprises.com" }
      ],
      Orders: [
        { order_id: 5001, customer_id: 101, order_date: "2024-03-01", amount: 349.50 },
        { order_id: 5002, customer_id: 101, order_date: "2024-03-15", amount: 120.00 },
        { order_id: 5003, customer_id: 102, order_date: "2024-03-10", amount: 4890.00 }
      ]
    }
  },

  {
    id: "department_employee",
    title: "3. Department → Employee (1:N Ref)",
    description: "One-to-Many relationship accessed independently. Demonstrates referencing Department from Employee across separate collections.",
    schema: `CREATE TABLE Department (
    department_id INT PRIMARY KEY,
    department_name VARCHAR(100)
);

CREATE TABLE Employee (
    employee_id INT PRIMARY KEY,
    department_id INT,
    employee_name VARCHAR(100),
    salary DECIMAL(10,2),
    FOREIGN KEY (department_id) REFERENCES Department(department_id)
);`,
    queries: `SELECT *
FROM Department
WHERE department_id = 10;

SELECT employee_id, employee_name, salary
FROM Employee
WHERE employee_id = 501;`,
    sampleData: {
      Department: [
        { department_id: 10, department_name: "Research & Development" },
        { department_id: 20, department_name: "Engineering Infrastructure" }
      ],
      Employee: [
        { employee_id: 501, department_id: 10, employee_name: "Grace Hopper", salary: 145000.00 },
        { employee_id: 502, department_id: 10, employee_name: "Alan Turing", salary: 152000.00 },
        { employee_id: 503, department_id: 20, employee_name: "Ada Lovelace", salary: 148000.00 }
      ]
    }
  }
];
