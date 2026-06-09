const filtrosSexo = document.querySelectorAll(".filtro-sexo");
const filtrosPorte = document.querySelectorAll(".filtro-porte");
const filtrosIdade = document.querySelectorAll(".filtro-idade");

const cards = document.querySelectorAll(".animal-card");

function filtrarAnimais() {

    const sexosSelecionados = [...filtrosSexo]
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    const portesSelecionados = [...filtrosPorte]
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    const idadesSelecionadas = [...filtrosIdade]
        .filter(cb => cb.checked)
        .map(cb => Number(cb.value));

    cards.forEach(card => {

        const sexo = card.dataset.sexo;
        const porte = card.dataset.porte;
        const idade = Number(card.dataset.idade);

        const sexoValido =
            sexosSelecionados.length === 0 ||
            sexosSelecionados.includes(sexo);

        const porteValido =
            portesSelecionados.length === 0 ||
            portesSelecionados.includes(porte);

        let idadeValida = true;

        if (idadesSelecionadas.length > 0) {

            idadeValida = false;

            idadesSelecionadas.forEach(filtro => {

                if (filtro === 1 && idade <= 1) {
                    idadeValida = true;
                }

                if (filtro === 5 && idade <= 5) {
                    idadeValida = true;
                }

                if (filtro === 6 && idade > 5) {
                    idadeValida = true;
                }

            });
        }

        if (sexoValido && porteValido && idadeValida) {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }

    });
}

[
    ...filtrosSexo,
    ...filtrosPorte,
    ...filtrosIdade
].forEach(filtro => {
    filtro.addEventListener("change", filtrarAnimais);
});