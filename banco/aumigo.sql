CREATE DATABASE IF NOT EXISTS aumigo;
USE aumigo;

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    endereco VARCHAR(200) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    cpf VARCHAR(14) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE animais (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL,
    especie VARCHAR(50) NOT NULL,
    sexo ENUM('Macho','Fêmea') NOT NULL,
    porte ENUM('Pequeno','Médio','Grande') NOT NULL,
    idade INT NOT NULL,
    historia TEXT,
    imagem VARCHAR(255),
    status ENUM('Disponível','Adotado') DEFAULT 'Disponível'
);

CREATE TABLE adocoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    animal_id INT NOT NULL,
    data_solicitacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('Pendente','Aprovada','Recusada') DEFAULT 'Pendente',

    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (animal_id) REFERENCES animais(id)
);

CREATE TABLE doacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    tipo_doacao VARCHAR(50) NOT NULL,
    quantidade_valor VARCHAR(100) NOT NULL,
    forma_entrega VARCHAR(50) NOT NULL,
    data_doacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    descricao TEXT,
    preco DECIMAL(10,2) NOT NULL,
    preco_antigo DECIMAL(10,2),
    imagem VARCHAR(255),
    destaque VARCHAR(50)
);

CREATE TABLE carrinho (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    produto_id INT NOT NULL,
    quantidade INT DEFAULT 1,

    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
);


(nome, categoria, descricao, preco, preco_antigo, imagem, destaque)
VALUES
('Ração Premium', 'Ração',
'Alimentação completa e saudável para cachorros.',
89.90, 99.90, 'racao.png', 'Mais vendido'),

('Brinquedo Mordedor', 'Brinquedos',
'Ideal para diversão e saúde dos dentes.',
24.90, 34.90, 'mordedor.png', 'Promoção'),

('Coleira Ajustável', 'Acessórios',
'Conforto e segurança para passeios.',
35.90, 45.90, 'coleira.png', 'Destaque');

INSERT INTO animais
(nome, especie, sexo, porte, idade, historia, imagem)
VALUES
('Thor', 'Cachorro', 'Macho', 'Médio', 2,
'Thor é brincalhão e muito carinhoso.',
'thor.png'),

('Luna', 'Cachorro', 'Fêmea', 'Pequeno', 1,
'Luna adora brincar e receber carinho.',
'luna.png'),

('Pingo', 'Cachorro', 'Macho', 'Grande', 4,
'Pingo é tranquilo e muito amigável.',
'pingo.png');