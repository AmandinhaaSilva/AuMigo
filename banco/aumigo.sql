CREATE DATABASE aumigo;
USE aumigo;

-- Usuários
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100),
    endereco VARCHAR(200),
    telefone VARCHAR(20),
    email VARCHAR(100) UNIQUE,
    cpf VARCHAR(14) UNIQUE,
    senha VARCHAR(255),
    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Histórico de login
CREATE TABLE login (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    email VARCHAR(100),
    data_login DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Cachorros cadastrados
CREATE TABLE cachorros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50),
    sexo VARCHAR(20),
    porte VARCHAR(20),
    idade INT,
    historia TEXT,
    imagem VARCHAR(255),
    status VARCHAR(30) DEFAULT 'Disponível'
);

-- Pedidos de adoção
CREATE TABLE adocoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    cachorro_id INT,
    data_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) DEFAULT 'Pendente',

    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (cachorro_id) REFERENCES cachorros(id)
);

-- Alterações dos dados
CREATE TABLE alteracoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    campo_alterado VARCHAR(100),
    valor_antigo TEXT,
    valor_novo TEXT,
    data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Loja
CREATE TABLE produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100),
    categoria VARCHAR(50),
    descricao TEXT,
    preco DECIMAL(10,2),
    estoque INT,
    imagem VARCHAR(255)
);

-- Carrinho
CREATE TABLE carrinho (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    produto_id INT,
    quantidade INT DEFAULT 1,

    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
);