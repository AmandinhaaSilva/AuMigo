# Histórico de tarefas — Plano AuFriends Firebase

Registro das tarefas concluídas retiradas do checklist ativo da nota Maestri `Plano-AuFriends-Firebase-20261003`.

## T16 — Disponibilizar o baseline visual atual em localhost

- Estado: CONCLUÍDO em 03/10/2026.
- Responsável: Orquestrador.
- Versão verificada: branch `main`, commit-base `24d2fef574cc8b40658e49ed0b1876467191933c`, árvore Git limpa durante a validação.
- Objetivo: executar o código recebido sem modificar a aplicação, abrir a interface em localhost e identificar as limitações reais do baseline.
- Critério de aceite: URL local respondendo, interface aberta no navegador e evidência das páginas visualizadas e dos bloqueios técnicos.
- Resultado: PHP 8.4.25 foi instalado fora do repositório e o servidor foi iniciado em `http://127.0.0.1:8000`. Login, cadastro, Sobre, Adoções, Doações, Loja, Carrinho, CSS e imagens responderam com HTTP 200. A inspeção visual confirmou estilos e assets nas telas de Login, Sobre, Adoções e Loja.
- Evidência adicional no Maestri: o Portal `AuFriends Local` abriu o localhost; nele foi adicionado o produto Ração Premium ao carrinho e foram observados quantidade 1, subtotal de R$ 89,90 e total de R$ 89,90.
- Comportamento preexistente observado: a raiz redireciona para `entrar.html`; o botão atual de finalizar compra apenas limpa o carrinho.
- Limitações do baseline: login funcional, banco e painel administrativo não foram validados por ausência de MySQL/mysqli. Essas limitações pertencem ao código recebido e não foram causadas pela tarefa.
