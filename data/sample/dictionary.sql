-- Dictionary database created for MariaDb or MySQL

-- TINYINT correspondo to BOOLEAN IN MySQL

CREATE DATABASE Dictioanry;

USE Dictioanry;

CREATE TABLE Word (
    ID INT PRIMARY KEY AUTO_INCREMENT,
    Letter VARCHAR(1) NOT NULL,
    Definition VARCHAR(255) NOT NULL,
    Example VARCHAR(255),
    Antonym INT,
    Synonym INT,
    Favorite TINYINT(1) NOT NULL DEFAULT 0
);

CREATE TABLE User (
    ID INT PRIMARY KEY AUTO_INCREMENT,
    Name VARCHAR(12) NOT NULL,
    Email VARCHAR(20) NOT NULL,
    Password VARCHAR(20) NOT NULL,
    Admin TINYINT(1) NOT NULL DEFAULT 0
);

CREATE TABLE Synonym (
    ID INT PRIMARY KEY AUTO_INCREMENT,
    IDWord INT,
    Synonym VARCHAR(20),
    FOREIGN KEY (IDWord) REFERENCES Word(ID)
);

CREATE TABLE Antonym (
    ID INT PRIMARY KEY AUTO_INCREMENT,
    IDWord INT,
    Antonym VARCHAR(20),
    FOREIGN KEY (IDWord) REFERENCES Word(ID)
);


-- Transact-SQL for Microsoft SQL Server
/*
CREATE DATABASE Dictioanry;

USE Dictioanry;

CREATE TABLE Word (
    ID INT PRIMARY KEY IDENTITY(1,1),
    Letter VARCHAR(1) NOT NULL,
    Definition VARCHAR(255) NOT NULL,
    Example VARCHAR(255),
    Antonym INT,
    Synonym INT,
    Favorite TINYINT(1) NOT NULL DEFAULT 0
);

CREATE TABLE User (
    ID INT PRIMARY KEY IDENTITY(1,1),
    Name VARCHAR(12) NOT NULL,
    Email VARCHAR(20) NOT NULL,
    Password VARCHAR(20) NOT NULL,
    Admin TINYINT(1) NOT NULL DEFAULT 0
);

CREATE TABLE Synonym (
    ID INT PRIMARY KEY IDENTITY(1,1),
    IDWord INT,
    Synonym VARCHAR(20),
    FOREIGN KEY (IDWord) REFERENCES Word(ID)
);

CREATE TABLE Antonym (
    ID INT PRIMARY KEY IDENTITY(1,1),
    IDWord INT,
    Antonym VARCHAR(20),
    FOREIGN KEY (IDWord) REFERENCES Word(ID)
);

*/
