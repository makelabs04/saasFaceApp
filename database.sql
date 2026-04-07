-- Face Recognition SaaS - Database Schema
-- Run this file to set up the database

CREATE DATABASE IF NOT EXISTS facerecog_db;
USE facerecog_db;

-- Users table (SaaS accounts)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Persons table (people whose faces are registered)
CREATE TABLE IF NOT EXISTS persons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    age INT,
    email VARCHAR(150),
    mobile VARCHAR(20),
    face_label VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Face samples table (stores face descriptor data)
CREATE TABLE IF NOT EXISTS face_samples (
    id INT AUTO_INCREMENT PRIMARY KEY,
    person_id INT NOT NULL,
    user_id INT NOT NULL,
    image_path VARCHAR(255),
    face_descriptor TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_persons_user_id ON persons(user_id);
CREATE INDEX idx_face_samples_person_id ON face_samples(person_id);
CREATE INDEX idx_face_samples_user_id ON face_samples(user_id);
