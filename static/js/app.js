/* ==========================================================================
   ANTIGRAVITY FINANÇAS - MONOCHROME LIQUID GLASS SPA CORE ENGINE
   ========================================================================== */

class FinanceApp {
    constructor() {
        this.state = {
            activeView: 'dashboard',
            currentMonth: '', // Formato: YYYY-MM
            transactions: [],
            accounts: [],
            cards: [],
            categories: [],
            budgets: [],
            metas: [],
            summary: null,
            investmentData: null,
            filters: {
                tipo: '',
                categoria_id: '',
                parcelado: '',
                recorrente: '',
                busca: '',
                periodo: ''
            },
            editingAccountId: null,
            editingCardId: null,
            configs: {},
            dia_corte: 14,
            activeSettingsTab: 'categorias'
        };
        
        // Cache global de gráficos Chart.js para destruição/recriação
        this.charts = {};
        
        // Monkey patch alert global do navegador para usar nosso modal customizado
        window.alert = (msg) => this.showAlert(msg);

        this.init();
    }

    async init() {
        this.loadTheme();
        
        // Verifica a sessão antes de carregar dados ou tratar roteamento
        const loggedIn = await this.checkAuthSession();
        if (!loggedIn) {
            lucide.createIcons(); // Garante os ícones da tela de login
            return;
        }

        this.setupMonthSelector();
        this.setupEventListeners();
        
        // Carrega dados estruturais base (Contas, Cartões, Categorias)
        await this.loadBaseData();
        
        // Inicializa o roteamento SPA baseado no hash da URL ou default
        this.handleRouting();
    }

    async checkAuthSession() {
        try {
            const res = await fetch('/api/auth/session');
            const data = await res.json();
            if (data.logged_in) {
                this.state.user = data.user;
                document.getElementById('login-container').style.display = 'none';
                document.querySelector('.app-container').style.display = 'grid';
                
                const userSpan = document.getElementById('logged-user-name');
                if (userSpan) {
                    userSpan.textContent = data.user.nome;
                }
                return true;
            } else {
                this.state.user = null;
                document.getElementById('login-container').style.display = 'flex';
                document.querySelector('.app-container').style.display = 'none';
                return false;
            }
        } catch (err) {
            console.error("Erro ao verificar sessão de login:", err);
            return false;
        }
    }

    showAuthLoginView() {
        document.getElementById('auth-login-view').style.display = 'block';
        document.getElementById('auth-register-view').style.display = 'none';
        lucide.createIcons();
    }

    showAuthRegisterView() {
        document.getElementById('auth-login-view').style.display = 'none';
        document.getElementById('auth-register-view').style.display = 'block';
        lucide.createIcons();
    }

    formatCPF(input) {
        let value = input.value.replace(/\D/g, "");
        if (value.length > 11) value = value.slice(0, 11);
        
        let formatted = "";
        if (value.length <= 3) {
            formatted = value;
        } else if (value.length <= 6) {
            formatted = `${value.slice(0, 3)}.${value.slice(3)}`;
        } else if (value.length <= 9) {
            formatted = `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6)}`;
        } else {
            formatted = `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`;
        }
        input.value = formatted;
    }

    async handleAuthLogin(e) {
        e.preventDefault();
        const cpfRaw = document.getElementById('login-cpf').value;
        const senha = document.getElementById('login-senha').value;
        const cpf = cpfRaw.replace(/\D/g, "");

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpf, senha })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro de login");

            this.state.user = data.user;
            this.showAlert(`Bem-vindo(a) de volta, ${data.user.nome}!`);
            
            // Oculta container de login e exibe aplicação
            document.getElementById('login-container').style.display = 'none';
            document.querySelector('.app-container').style.display = 'grid';
            
            const userSpan = document.getElementById('logged-user-name');
            if (userSpan) {
                userSpan.textContent = data.user.nome;
            }

            // Inicializa dados e rotas
            await this.postLoginInit();
        } catch (err) {
            this.showAlert(err.message);
        }
    }

    async handleAuthRegister(e) {
        e.preventDefault();
        const nome = document.getElementById('register-nome').value;
        const cpfRaw = document.getElementById('register-cpf').value;
        const senha = document.getElementById('register-senha').value;
        const cpf = cpfRaw.replace(/\D/g, "");

        if (cpf.length !== 11) {
            this.showAlert("O CPF deve conter exatamente 11 números.");
            return;
        }

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, cpf, senha })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro ao se cadastrar");

            this.state.user = data.user;
            this.showAlert("Cadastro realizado com sucesso!");
            
            // Oculta container de login e exibe aplicação
            document.getElementById('login-container').style.display = 'none';
            document.querySelector('.app-container').style.display = 'grid';
            
            const userSpan = document.getElementById('logged-user-name');
            if (userSpan) {
                userSpan.textContent = data.user.nome;
            }

            // Inicializa dados e rotas
            await this.postLoginInit();
        } catch (err) {
            this.showAlert(err.message);
        }
    }

    async handleAuthLogout() {
        const confirmLogout = confirm("Deseja realmente sair do sistema?");
        if (!confirmLogout) return;

        try {
            const res = await fetch('/api/auth/logout', { method: 'POST' });
            if (!res.ok) throw new Error("Erro ao deslogar");

            this.state.user = null;
            
            // Redireciona de forma limpa para a raiz do site, limpando o hash e forçando reload limpo
            window.location.href = window.location.origin + window.location.pathname;
        } catch (err) {
            this.showAlert(err.message);
        }
    }

    async postLoginInit() {
        this.setupMonthSelector();
        this.setupEventListeners();
        await this.loadBaseData();
        
        // Inicializa o roteamento SPA
        if (!window.location.hash || window.location.hash === '#/') {
            window.location.hash = '#/dashboard';
        }
        this.handleRouting();
        lucide.createIcons();
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme');
        const isLight = savedTheme === 'light';
        if (isLight) {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
        this.updateThemeToggleIcon(isLight);
    }

    toggleTheme() {
        const isLight = document.body.classList.toggle('light-theme');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        this.updateThemeToggleIcon(isLight);
        this.refreshCurrentView();
    }

    updateThemeToggleIcon(isLight) {
        const button = document.getElementById('theme-toggle');
        if (button) {
            button.innerHTML = isLight ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
            lucide.createIcons();
        }
    }

    // Define o mês inicial (mês corrente do sistema)
    setupMonthSelector() {
        const inputMonth = document.getElementById('global-month');
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const currentMonthStr = `${year}-${month}`;
        
        this.state.currentMonth = currentMonthStr;
        inputMonth.value = currentMonthStr;

        inputMonth.addEventListener('change', (e) => {
            this.state.currentMonth = e.target.value;
            this.refreshCurrentView();
        });
    }

    setupEventListeners() {
        // Cliques no Sidebar
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.getAttribute('data-view');
                window.location.hash = `/${view}`;
            });
        });

        // Evento de Hash Change no Window (Navegação SPA nativa e histórico)
        window.addEventListener('hashchange', () => this.handleRouting());
    }

    // Carrega categorias, contas bancárias e cartões (essencial para preencher selects dos forms)
    async loadBaseData() {
        try {
            const [contasRes, cartoesRes, categoriasRes, configsRes] = await Promise.all([
                fetch('/api/contas'),
                fetch('/api/cartoes'),
                fetch('/api/categorias'),
                fetch('/api/configuracoes')
            ]);

            this.state.accounts = await contasRes.json();
            this.state.cards = await cartoesRes.json();
            this.state.categories = await categoriasRes.json();
            this.state.configs = await configsRes.json();
            this.state.dia_corte = parseInt(this.state.configs.dia_corte || 14);
            
            // Popula selects estruturais nos modais
            this.populateSelects();
        } catch (err) {
            console.error("Erro ao carregar dados iniciais:", err);
            alert("Erro de conexão ao carregar dados do banco de dados.");
        }
    }

    populateSelects() {
        const selectContaOrigem = document.getElementById('t-conta-origem');
        const selectContaDestino = document.getElementById('t-conta-destino');
        const selectCartao = document.getElementById('t-cartao');
        const selectCategoria = document.getElementById('t-categoria');
        
        const selectOrcCategoria = document.getElementById('orc-categoria');
        const selectFaturaConta = document.getElementById('fatura-conta');
        const selectMetaOpConta = document.getElementById('meta-op-conta');
        const selectCardContaPagamento = document.getElementById('card-conta-pagamento');

        // Limpa opções anteriores
        const cleanAndFill = (selectEl, items, placeholder = "Selecione...") => {
            selectEl.innerHTML = '';
            if (placeholder) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = placeholder;
                selectEl.appendChild(opt);
            }
            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = item.nome;
                selectEl.appendChild(opt);
            });
        };

        // Popula Contas
        cleanAndFill(selectContaOrigem, this.state.accounts, "Selecione a conta...");
        cleanAndFill(selectContaDestino, this.state.accounts, "Selecione a conta...");
        cleanAndFill(selectFaturaConta, this.state.accounts, "Selecione a conta...");
        cleanAndFill(selectMetaOpConta, this.state.accounts, "Selecione a conta...");
        cleanAndFill(selectCardContaPagamento, this.state.accounts, "Nenhuma (Opcional)");

        // Popula Cartões
        cleanAndFill(selectCartao, this.state.cards, "Selecione o cartão...");

        // Popula Categorias (divididas por tipo no JS durante preenchimento)
        this.fillCategoriasSelect();

        // Popula categorias de despesa no form de Orçamento
        const despesasCats = this.state.categories.filter(c => c.tipo === 'DESPESA');
        cleanAndFill(selectOrcCategoria, despesasCats, "Selecione a categoria...");
    }

    fillCategoriasSelect() {
        const selectCategoria = document.getElementById('t-categoria');
        const tipoSelected = document.querySelector('input[name="tipo"]:checked').value;
        
        selectCategoria.innerHTML = '';
        const filtered = this.state.categories.filter(c => c.tipo === tipoSelected);
        
        filtered.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nome;
            selectCategoria.appendChild(opt);
        });
    }

    // Controle do Roteador SPA
    handleRouting() {
        const hash = window.location.hash || '#/dashboard';
        const view = hash.replace('#/', '');
        
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            if (item.getAttribute('data-view') === view) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        this.state.activeView = view;
        this.refreshCurrentView();
    }

    async refreshCurrentView() {
        const viewPanel = document.getElementById('app-view');
        
        // 1. Carrega dados correspondentes antes de renderizar
        await this.loadViewData();

        // 2. Remove animação para reiniciar
        viewPanel.classList.remove('transition-fade');
        void viewPanel.offsetWidth; // Trigger reflow

        // 3. Atualiza títulos com base na view
        const titleEl = document.getElementById('view-title');
        const subtitleEl = document.getElementById('view-subtitle');

        switch (this.state.activeView) {
            case 'dashboard':
                titleEl.textContent = 'Dashboard';
                subtitleEl.textContent = 'Acompanhe seu fluxo de caixa e faturas do mês.';
                this.renderDashboard();
                break;
            case 'transacoes':
                titleEl.textContent = 'Transações';
                subtitleEl.textContent = 'Monitore, filtre e gerencie seus lançamentos históricos.';
                this.renderTransacoes();
                break;
            case 'contas-cartoes':
                titleEl.textContent = 'Contas & Cartões';
                subtitleEl.textContent = 'Cadastre e acompanhe seus saldos bancários e limites de crédito.';
                this.renderContasCartoes();
                break;
            case 'faturas':
                titleEl.textContent = 'Gerenciamento de Faturas';
                subtitleEl.textContent = 'Acompanhe as faturas dos seus cartões de crédito e histórico de pagamentos.';
                this.renderFaturas();
                break;
            case 'orcamentos':
                titleEl.textContent = 'Orçamentos';
                subtitleEl.textContent = 'Planeje metas de gastos mensais por categorias.';
                this.renderOrcamentos();
                break;
            case 'metas':
                titleEl.textContent = 'Metas de Economia';
                subtitleEl.textContent = 'Poupe dinheiro de forma focada para seus objetivos futuros.';
                this.renderMetas();
                break;
            case 'configuracoes':
                titleEl.textContent = 'Configurações';
                subtitleEl.textContent = 'Gerencie as configurações da sua carteira e categorias.';
                this.renderConfiguracoes();
                break;
            case 'investimentos':
                titleEl.textContent = 'Investimentos';
                subtitleEl.textContent = 'Monitore seus ativos de renda fixa e rendimentos pelo Banco Central.';
                this.renderInvestimentos();
                break;
            default:
                titleEl.textContent = 'Dashboard';
                this.renderDashboard();
        }

        // 4. Adiciona animação de fade após renderizar o HTML atualizado
        viewPanel.classList.add('transition-fade');

        // Recria os ícones Lucide injetados dinamicamente
        lucide.createIcons();
    }

    // Carrega dados da API específicos de cada tela
    async loadViewData() {
        try {
            // Toda view precisa das contas/cartões atualizados
            const [contasRes, cartoesRes] = await Promise.all([
                fetch('/api/contas'),
                fetch('/api/cartoes')
            ]);
            this.state.accounts = await contasRes.json();
            this.state.cards = await cartoesRes.json();
            this.populateSelects();

            if (this.state.activeView === 'dashboard') {
                const res = await fetch(`/api/resumo?mes=${this.state.currentMonth}`);
                this.state.summary = await res.json();
            } else if (this.state.activeView === 'transacoes') {
                let url = `/api/transacoes?mes=${this.state.currentMonth}`;
                if (this.state.filters.tipo) url += `&tipo=${this.state.filters.tipo}`;
                if (this.state.filters.categoria_id) url += `&categoria_id=${this.state.filters.categoria_id}`;
                if (this.state.filters.busca) url += `&busca=${encodeURIComponent(this.state.filters.busca)}`;
                
                const res = await fetch(url);
                this.state.transactions = await res.json();
            } else if (this.state.activeView === 'orcamentos') {
                const [orcRes, resumoRes] = await Promise.all([
                    fetch(`/api/orcamentos?mes=${this.state.currentMonth}`),
                    fetch(`/api/resumo?mes=${this.state.currentMonth}`)
                ]);
                this.state.budgets = await orcRes.json();
                this.state.summary = await resumoRes.json();
            } else if (this.state.activeView === 'metas') {
                const res = await fetch('/api/metas');
                this.state.metas = await res.json();
            } else if (this.state.activeView === 'configuracoes') {
                const res = await fetch('/api/categorias');
                this.state.categories = await res.json();
            } else if (this.state.activeView === 'investimentos') {
                const res = await fetch(`/api/investimentos?mes=${this.state.currentMonth}`);
                this.state.investmentData = await res.json();
            } else if (this.state.activeView === 'faturas') {
                const [payRes, fatRes] = await Promise.all([
                    fetch('/api/transacoes?is_pagamento_fatura=true'),
                    fetch('/api/faturas')
                ]);
                this.state.billPayments = await payRes.json();
                this.state.allFaturas = await fatRes.json();
            }
        } catch (err) {
            console.error("Erro ao carregar dados para a tela:", err);
        }
    }

    // ==================== RENDERS DAS VIEWS ====================

    renderDashboard() {
        const viewPanel = document.getElementById('app-view');
        const s = this.state.summary;
        if (!s) return;

        // Formata moeda
        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        viewPanel.innerHTML = `
            <!-- Painel Superior de Resumos -->
            <div class="summary-grid">
                <div class="glass glass-card summary-card">
                    <div class="summary-card-header">
                        <span>Saldo Total Disponível</span>
                        <i data-lucide="wallet"></i>
                    </div>
                    <div class="summary-card-body">
                        <div class="summary-value">${fmt(s.saldo_geral)}</div>
                    </div>
                </div>
                
                <div class="glass glass-card summary-card">
                    <div class="summary-card-header">
                        <span>Receitas do Mês</span>
                        <i data-lucide="arrow-up-right"></i>
                    </div>
                    <div class="summary-card-body">
                        <div class="summary-value">${fmt(s.total_receitas)}</div>
                    </div>
                </div>
                
                <div class="glass glass-card summary-card">
                    <div class="summary-card-header">
                        <span>Despesas do Mês</span>
                        <i data-lucide="arrow-down-left"></i>
                    </div>
                    <div class="summary-card-body">
                        <div class="summary-value">${fmt(s.total_despesas)}</div>
                    </div>
                </div>
                
                <div class="glass glass-card summary-card">
                    <div class="summary-card-header">
                        <span>Balanço Mensal</span>
                        <i data-lucide="scale"></i>
                    </div>
                    <div class="summary-card-body">
                        <div class="summary-value" style="color: var(--solid-white);">${fmt(s.balanco)}</div>
                    </div>
                </div>

                <div class="glass glass-card summary-card" style="border-color: rgba(239, 68, 68, 0.25);">
                    <div class="summary-card-header">
                        <span>Ainda Falta Pagar</span>
                        <i data-lucide="alert-circle" style="color: #ef4444;"></i>
                    </div>
                    <div class="summary-card-body">
                        <div class="summary-value" style="color: #ef4444;">${fmt(s.falta_pagar || 0)}</div>
                    </div>
                </div>
            </div>

            <!-- Gráficos e Cartões -->
            <div class="dashboard-details-grid">
                <!-- Coluna Esquerda: Gráficos -->
                <div style="display: flex; flex-direction: column; gap: 1.8rem;">
                    <!-- Gráfico de Categoria (Rosca) -->
                    <div class="glass glass-card chart-container-glass" style="width: 100%; min-height: 320px;">
                        <h3 class="chart-title">Despesas por Categoria</h3>
                        <div style="position: relative; width: 100%; height: 260px;">
                            <canvas id="chart-categorias"></canvas>
                        </div>
                    </div>

                    <!-- Projeção Financeira dos Próximos 6 Meses -->
                    <div class="glass glass-card" style="padding: 1.8rem;">
                        <h3 class="chart-title" style="margin-bottom: 1.2rem;">Projeção Financeira (Mês Atual + Próximos 6 Meses)</h3>
                        <div style="position: relative; width: 100%; height: 320px;">
                            <canvas id="chart-projecao"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Coluna Direita: Detalhes de Faturas de Cartão -->
                <div class="glass glass-card" style="height: 100%; display: flex; flex-direction: column;">
                    <h3 class="chart-title">Faturas do Mês</h3>
                    <div class="cards-slider-container" style="flex: 1;">
                        ${s.faturas_cartoes.length === 0 ? '<p class="text-gray">Nenhum cartão cadastrado.</p>' : ''}
                        
                        ${s.faturas_cartoes.map(card => {
                            const percent = card.limite > 0 ? (card.limite_disponivel / card.limite) * 100 : 0;
                            const bank = this.getBankDetails(card.nome);
                            return `
                                <div class="credit-card-ui ${bank.class}" onclick="app.openModalDetalhesCartao(${card.id})" style="cursor: pointer;">
                                    <div class="card-top">
                                        <span class="card-brand">${card.nome}</span>
                                        <div class="card-logo-container">${bank.logo || '<div class="card-chip"></div>'}</div>
                                    </div>
                                    <div class="card-middle">
                                        <div class="card-limit-info">
                                            <span>Fatura: ${fmt(card.fatura_mes)}</span>
                                            <span>Disponível: ${fmt(card.limite_disponivel)}</span>
                                        </div>
                                        <div class="progress-bar-wrapper">
                                            <div class="progress-bar-fill" style="width: ${percent}%"></div>
                                        </div>
                                    </div>
                                    <div class="card-bottom">
                                        <div style="display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.75rem; text-align: left; align-items: flex-start;">
                                            <span class="card-name" style="margin: 0; line-height: 1;">${card.conta_bancaria_nome || ''}</span>
                                            ${card.pessoa ? `<span style="font-size: 0.65rem; opacity: 0.7; line-height: 1;">Titular: ${card.pessoa}</span>` : ''}
                                        </div>
                                        <div class="card-actions-wrapper" style="display: flex; gap: 0.4rem;">
                                            <button class="card-action-btn btn-secondary-card" onclick="event.stopPropagation(); app.openModalDetalhesCartao(${card.id})" style="background: rgba(255,255,255,0.1); color: var(--text-color); border: 1px solid var(--glass-border);">
                                                Detalhes
                                            </button>
                                            <button class="card-action-btn" onclick="event.stopPropagation(); app.openModalPagarFatura(${card.id}, '${card.nome}', ${card.fatura_pendente})">
                                                Pagar Fatura
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>

            <!-- Finanças por Integrante da Família -->
            <div class="glass glass-card" style="margin-top: 1.8rem; padding: 1.8rem;">
                <h3 class="chart-title">Finanças por Integrante da Família</h3>
                <div class="members-flow-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem; margin-top: 1.2rem;">
                    ${(s.fluxo_pessoas || []).map(p => {
                        const total = p.ganhou + p.gastou;
                        const pctGasto = total > 0 ? (p.gastou / total) * 100 : 0;
                        const pctGanho = total > 0 ? (p.ganhou / total) * 100 : 0;
                        return `
                            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.2rem; display: flex; flex-direction: column; justify-content: space-between;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
                                    <span style="font-weight: 600; font-size: 1rem;">${p.pessoa}</span>
                                    <span class="badge badge-status" style="font-size: 0.7rem; padding: 0.15rem 0.35rem;">${p.pessoa.substring(0, 2).toUpperCase()}</span>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1rem;">
                                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                                        <span class="text-gray">Receitas:</span>
                                        <span style="font-weight: 600; color: var(--solid-white);">${fmt(p.ganhou)}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                                        <span class="text-gray">Despesas:</span>
                                        <span style="font-weight: 600; color: #888;">${fmt(p.gastou)}</span>
                                    </div>
                                </div>
                                <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; display: flex; margin-bottom: 0.8rem;">
                                    <div style="width: ${pctGanho}%; height: 100%; background: var(--solid-white);" title="Receitas"></div>
                                    <div style="width: ${pctGasto}%; height: 100%; background: #666;" title="Despesas"></div>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
                                    <span>Saldo:</span>
                                    <span style="font-weight: 600; color: var(--solid-white);">${fmt(p.ganhou - p.gastou)}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // Renderiza Gráficos Chart.js
        this.renderCategoryChart(s.distribuicao_categorias);
        this.renderProjecaoChart(s);
    }

    renderCategoryChart(distribuicao) {
        const canvas = document.getElementById('chart-categorias');
        if (!canvas) return;

        if (this.charts['categorias']) {
            this.charts['categorias'].destroy();
        }

        const isLight = document.body.classList.contains('light-theme');
        const textColor = isLight ? '#000000' : '#ffffff';
        const borderColor = isLight ? '#ffffff' : '#101010';

        if (distribuicao.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = isLight ? '#666666' : '#8c8c8c';
            ctx.font = '14px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText('Nenhuma despesa registrada no mês.', canvas.width / 2, canvas.height / 2);
            return;
        }

        const labels = distribuicao.map(d => d.categoria);
        const data = distribuicao.map(d => d.valor);

        // Paleta luxo vibrante translúcida
        const colors = [
            'rgba(79, 70, 229, 0.85)',   // Indigo
            'rgba(16, 185, 129, 0.85)',  // Emerald Green
            'rgba(249, 115, 22, 0.85)',  // Orange
            'rgba(236, 72, 153, 0.85)',  // Pink
            'rgba(6, 182, 212, 0.85)',   // Cyan
            'rgba(168, 85, 247, 0.85)',  // Purple
            'rgba(234, 179, 8, 0.85)',   // Yellow
            'rgba(239, 68, 68, 0.85)',   // Red
            'rgba(99, 102, 241, 0.65)',  // Light Indigo
            'rgba(45, 212, 191, 0.65)'   // Light Teal
        ];
        const borderColors = [
            '#4f46e5',
            '#10b981',
            '#f97316',
            '#ec4899',
            '#06b6d4',
            '#a855f7',
            '#eab308',
            '#ef4444',
            '#6366f1',
            '#2dd4bf'
        ];

        this.charts['categorias'] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, data.length),
                    borderColor: borderColors.slice(0, data.length),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: textColor,
                            font: { family: 'Outfit', size: 12 }
                        }
                    }
                }
            }
        });
    }

    renderProjecaoChart(s) {
        const canvas = document.getElementById('chart-projecao');
        if (!canvas) return;

        if (this.charts['projecao']) {
            this.charts['projecao'].destroy();
        }

        const isLight = document.body.classList.contains('light-theme');
        const textColor = isLight ? '#000000' : '#ffffff';

        const labels = s.projecoes.map(p => p.mes_nome);
        const receitasData = s.projecoes.map(p => p.receitas);
        const despesasData = s.projecoes.map(p => p.despesas);
        const saldoData = s.projecoes.map(p => p.saldo_projetado);

        this.charts['projecao'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Receitas Projetadas',
                        data: receitasData,
                        backgroundColor: 'rgba(16, 185, 129, 0.65)',
                        borderColor: '#10b981',
                        borderWidth: 2,
                        borderRadius: 6
                    },
                    {
                        label: 'Despesas Projetadas',
                        data: despesasData,
                        backgroundColor: 'rgba(239, 68, 68, 0.65)',
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        borderRadius: 6
                    },
                    {
                        label: 'Saldo Projetado',
                        data: saldoData,
                        type: 'line',
                        borderColor: isLight ? '#4f46e5' : '#818cf8',
                        backgroundColor: 'rgba(79, 70, 229, 0.12)',
                        borderWidth: 3,
                        tension: 0.35,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { family: 'Outfit', size: 11 } }
                    },
                    y: {
                        grid: { color: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' },
                        ticks: { color: textColor, font: { family: 'Outfit', size: 11 } }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: textColor,
                            font: { family: 'Outfit', size: 12 }
                        }
                    }
                }
            }
        });
    }

    renderTransacoes() {
        const viewPanel = document.getElementById('app-view');
        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        // Filtragem cliente-side para resposta instantânea e contabilidade dinâmica
        let filtered = [...this.state.transactions];

        // 1. Filtro de Tipo (seletor de botões)
        if (this.state.filters.tipo) {
            filtered = filtered.filter(t => t.tipo === this.state.filters.tipo);
        }

        // 2. Filtro de Categoria
        if (this.state.filters.categoria_id) {
            filtered = filtered.filter(t => t.categoria_id === parseInt(this.state.filters.categoria_id));
        }

        // 3. Filtro de Parcelamento
        if (this.state.filters.parcelado) {
            if (this.state.filters.parcelado === 'SIM') {
                filtered = filtered.filter(t => t.total_parcelas !== null);
            } else if (this.state.filters.parcelado === 'NAO') {
                filtered = filtered.filter(t => t.total_parcelas === null);
            }
        }

        // 4. Filtro de Recorrência / Fixas
        if (this.state.filters.recorrente) {
            if (this.state.filters.recorrente === 'SIM') {
                filtered = filtered.filter(t => t.recorrente === true);
            } else if (this.state.filters.recorrente === 'NAO') {
                filtered = filtered.filter(t => !t.recorrente);
            }
        }

        // 5. Filtro de Período (Vencimento)
        if (this.state.filters.periodo) {
            const cutoff = this.state.dia_corte || 14;
            if (this.state.filters.periodo === 'ATE_CORTE') {
                filtered = filtered.filter(t => {
                    const dia = parseInt(t.data.split('-')[2]);
                    return dia <= cutoff;
                });
            } else if (this.state.filters.periodo === 'DEPOIS_CORTE') {
                filtered = filtered.filter(t => {
                    const dia = parseInt(t.data.split('-')[2]);
                    return dia > cutoff;
                });
            }
        }

        // Cálculos dinâmicos
        const sumReceitas = filtered.filter(t => t.tipo === 'RECEITA').reduce((acc, t) => acc + t.valor, 0);
        // Exclui pagamentos de fatura para evitar dupla contagem com as compras individuais
        const sumDespesas = filtered.filter(t => t.tipo === 'DESPESA' && !t.fatura_cartao_id).reduce((acc, t) => acc + t.valor, 0);
        const sumBalanco = sumReceitas - sumDespesas;

        viewPanel.innerHTML = `
            <div class="glass glass-card filter-bar" style="display: flex; flex-direction: column; gap: 1rem; padding: 1.2rem;">
                <!-- Primeira Linha: Filtro de Tipo, Busca e Ações -->
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 1.2rem; flex-wrap: wrap;">
                    <div class="filter-group-buttons" style="margin-bottom: 0;">
                        <button class="filter-btn ${this.state.filters.tipo === '' ? 'active' : ''}" onclick="app.setFilterTipo('')">Todas</button>
                        <button class="filter-btn ${this.state.filters.tipo === 'RECEITA' ? 'active' : ''}" onclick="app.setFilterTipo('RECEITA')">Receitas</button>
                        <button class="filter-btn ${this.state.filters.tipo === 'DESPESA' ? 'active' : ''}" onclick="app.setFilterTipo('DESPESA')">Despesas</button>
                        <button class="filter-btn ${this.state.filters.tipo === 'TRANSFERENCIA' ? 'active' : ''}" onclick="app.setFilterTipo('TRANSFERENCIA')">Transferências</button>
                    </div>

                    <div class="search-input-wrapper" style="flex-grow: 1; max-width: 400px;">
                        <i data-lucide="search"></i>
                        <input type="text" id="search-box" class="glass-input" placeholder="Pesquisar descrição ou pagador..." value="${this.state.filters.busca}" oninput="app.setFilterBusca(this.value)">
                    </div>

                    <div style="display: flex; gap: 0.8rem;">
                        <button class="btn btn-secondary" onclick="app.exportToCSV()">
                            <i data-lucide="download"></i> Exportar
                        </button>
                        <button class="btn btn-secondary" onclick="window.print()">
                            <i data-lucide="printer"></i> Imprimir PDF
                        </button>
                    </div>
                </div>
                
                <!-- Segunda Linha: Dropdowns adicionais e Soma Dinâmica -->
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 1.2rem; flex-wrap: wrap; border-top: 1px solid var(--glass-border); padding-top: 1rem;">
                    <div style="display: flex; gap: 0.8rem; flex-wrap: wrap; align-items: center;">
                        <!-- Filtro de Categoria -->
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <label for="filter-categoria" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 500;">Categoria:</label>
                            <select id="filter-categoria" class="glass-select" style="padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem;" onchange="app.setFilterCategoria(this.value)">
                                <option value="">Todas</option>
                                ${this.state.categories.map(cat => `
                                    <option value="${cat.id}" ${this.state.filters.categoria_id == cat.id ? 'selected' : ''}>${cat.nome}</option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <!-- Filtro de Parcelamento -->
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <label for="filter-parcelado" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 500;">Parcelamento:</label>
                            <select id="filter-parcelado" class="glass-select" style="padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem;" onchange="app.setFilterParcelado(this.value)">
                                <option value="" ${this.state.filters.parcelado === '' ? 'selected' : ''}>Todos</option>
                                <option value="SIM" ${this.state.filters.parcelado === 'SIM' ? 'selected' : ''}>Apenas Parcelados</option>
                                <option value="NAO" ${this.state.filters.parcelado === 'NAO' ? 'selected' : ''}>Não Parcelados</option>
                            </select>
                        </div>
                        
                        <!-- Filtro de Recorrência (Fixa) -->
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <label for="filter-recorrente" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 500;">Fixo/Variável:</label>
                            <select id="filter-recorrente" class="glass-select" style="padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem;" onchange="app.setFilterRecorrente(this.value)">
                                <option value="" ${this.state.filters.recorrente === '' ? 'selected' : ''}>Todos</option>
                                <option value="SIM" ${this.state.filters.recorrente === 'SIM' ? 'selected' : ''}>Apenas Fixas</option>
                                <option value="NAO" ${this.state.filters.recorrente === 'NAO' ? 'selected' : ''}>Apenas Variáveis</option>
                            </select>
                        </div>

                        <!-- Filtro de Período (Vencimento) -->
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <label for="filter-periodo" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 500;">Vencimento:</label>
                            <select id="filter-periodo" class="glass-select" style="padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem;" onchange="app.setFilterPeriodo(this.value)">
                                <option value="" ${this.state.filters.periodo === '' ? 'selected' : ''}>Todos os Dias</option>
                                <option value="ATE_CORTE" ${this.state.filters.periodo === 'ATE_CORTE' ? 'selected' : ''}>Até o dia ${this.state.dia_corte}</option>
                                <option value="DEPOIS_CORTE" ${this.state.filters.periodo === 'DEPOIS_CORTE' ? 'selected' : ''}>A partir do dia ${this.state.dia_corte + 1}</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- Soma Dinâmica -->
                    <div style="display: flex; gap: 1.2rem; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600;">
                        <span style="color: #22c55e;">Receitas: ${fmt(sumReceitas)}</span>
                        <span style="color: #ef4444;">Despesas: ${fmt(sumDespesas)}</span>
                        <span style="color: var(--text-color); border-left: 1px solid var(--glass-border); padding-left: 1rem; display: flex; gap: 0.4rem;">
                            Balanço: <span style="color: ${sumBalanco >= 0 ? '#22c55e' : '#ef4444'}">${fmt(sumBalanco)}</span>
                        </span>
                    </div>
                </div>
            </div>

            <!-- Barra de Edição em Lote (Bulk Update) -->
            <div id="bulk-edit-bar" style="display: none; align-items: center; justify-content: space-between; background: rgba(255, 170, 0, 0.08); border: 1px solid rgba(255, 170, 0, 0.25); padding: 0.8rem 1.5rem; border-radius: 12px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500;">
                <div>
                    <span id="bulk-selected-count" style="font-weight: 700; color: #ffaa00;">0</span> transações selecionadas para alteração em lote
                </div>
                <div style="display: flex; align-items: center; gap: 0.8rem;">
                    <label for="bulk-category-select" style="font-size: 0.85rem; color: var(--text-muted);">Nova Categoria:</label>
                    <select id="bulk-category-select" class="glass-select" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; border-radius: 6px;">
                        <option value="">Selecione a categoria...</option>
                        ${this.state.categories.map(cat => `<option value="${cat.id}">${cat.nome}</option>`).join('')}
                    </select>
                    <button class="btn btn-primary" style="padding: 0.4rem 1rem; font-size: 0.85rem; background: #ffaa00; border-color: #ffaa00; color: #000;" onclick="app.applyBulkCategory()">
                        Aplicar
                    </button>
                </div>
            </div>

            <div class="glass table-responsive">
                <table class="glass-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;">
                                <input type="checkbox" id="select-all-transactions" onchange="app.onSelectAllTransactions(this.checked)">
                            </th>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Descrição</th>
                            <th>Membro</th>
                            <th>Categoria / Destino</th>
                            <th>Origem / Pagador</th>
                            <th>Valor</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length === 0 ? '<tr><td colspan="10" class="text-gray" style="text-align: center; padding: 2rem;">Nenhuma transação encontrada para os filtros selecionados.</td></tr>' : ''}
                        
                        ${filtered.map(t => {
                            // Badge de Tipo
                            let typeBadge = '';
                            let catInfo = '';
                            let sourceInfo = '';

                            if (t.tipo === 'RECEITA') {
                                typeBadge = `<span class="badge badge-receita">Receita</span>`;
                                catInfo = t.categoria_nome || 'Sem Categoria';
                                sourceInfo = t.pagador_recebedor || '-';
                            } else if (t.tipo === 'DESPESA') {
                                typeBadge = `<span class="badge badge-despesa">Despesa</span>`;
                                catInfo = t.categoria_nome || 'Sem Categoria';
                                sourceInfo = t.cartao_credito_nome ? `<span class="badge badge-status">${t.cartao_credito_nome}</span>` : (t.conta_origem_nome || '-');
                            } else {
                                typeBadge = `<span class="badge badge-transferencia">Transf.</span>`;
                                catInfo = `→ ${t.conta_destino_nome}`;
                                sourceInfo = t.conta_origem_nome;
                            }

                            // Contador de Parcelas
                            const descExt = t.total_parcelas ? `${t.descricao} <small class="text-gray">(${t.numero_parcela}/${t.total_parcelas})</small>` : t.descricao;

                            // Formatação de Data
                            const parts = t.data.split('-');
                            const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

                            return `
                                <tr>
                                    <td style="text-align: center;">
                                        <input type="checkbox" class="select-transaction-checkbox" value="${t.id}" onchange="app.onSelectTransactionChange()">
                                    </td>
                                    <td>${formattedDate}</td>
                                    <td>${typeBadge}</td>
                                    <td>${descExt}</td>
                                    <td><span class="badge badge-status" style="font-size: 0.7rem; padding: 0.2rem 0.4rem;">${t.pessoa || 'Compartilhado'}</span></td>
                                    <td>${catInfo}</td>
                                    <td>${sourceInfo}</td>
                                    <td style="font-weight: 600;">${fmt(t.valor)}</td>
                                    <td>
                                        ${t.cartao_credito_id ? 
                                            `<span class="badge badge-status">Cartão</span>` : 
                                            `<span class="badge badge-status ${t.pago_ou_confirmado ? 'pago' : ''}" onclick="app.toggleConfirmacao(${t.id})">
                                                ${t.pago_ou_confirmado ? 'Conciliado' : 'Pendente'}
                                            </span>`
                                        }
                                    </td>
                                    <td>
                                        <div class="table-actions">
                                            <button class="btn-icon" title="Editar Transação" onclick="app.openModalEditTransacao(${t.id})">
                                                <i data-lucide="edit-3"></i>
                                            </button>
                                            <button class="btn-icon" title="Excluir Transação" onclick="app.handleDeleteTransacao(${t.id}, ${!!t.grupo_parcelamento_id})">
                                                <i data-lucide="trash-2"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderContasCartoes() {
        const viewPanel = document.getElementById('app-view');
        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        viewPanel.innerHTML = `
            <div class="panel-header-row">
                <h2>Múltiplas Contas Bancárias & Carteiras</h2>
                <div style="display: flex; gap: 0.8rem;">
                    <button class="btn btn-secondary" onclick="app.openModalTransferencia()">
                        <i data-lucide="arrow-left-right"></i> Transferir
                    </button>
                    <button class="btn btn-primary" onclick="app.openModalContaCartao('CONTA')">
                        <i data-lucide="plus"></i> Nova Conta
                    </button>
                </div>
            </div>
            
            <div class="contas-grid">
                ${this.state.accounts.map(acc => {
                    const bank = this.getBankDetails(acc.nome);
                    const logoMarkup = bank.logo ? `<div class="account-logo-container">${bank.logo}</div>` : '<i data-lucide="landmark"></i>';
                    return `
                        <div class="glass account-card ${bank.class}" onclick="app.openModalDetalhesConta(${acc.id})" style="cursor: pointer;">
                            <div class="account-header">
                                <span class="account-type">${acc.tipo} ${acc.pessoa ? `• ${acc.pessoa}` : ''}</span>
                                ${logoMarkup}
                            </div>
                            <div>
                                <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.4rem;">${acc.nome}</h3>
                                ${acc.banco ? `<div style="font-size: 0.75rem; opacity: 0.8; margin-bottom: 0.15rem;">${acc.banco}</div>` : ''}
                                ${acc.agencia || acc.numero_conta ? `<div style="font-size: 0.72rem; opacity: 0.7; margin-bottom: 0.5rem;">Ag: ${acc.agencia || '-'} / CC: ${acc.numero_conta || '-'}</div>` : ''}
                                <div class="account-balance-label">Saldo Atual</div>
                                <div class="account-balance" style="margin-top: 0.2rem;">${fmt(acc.saldo_atual)}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <div class="panel-header-row" style="margin-top: 3.5rem;">
                <h2>Meus Cartões de Crédito</h2>
                <button class="btn btn-secondary" onclick="app.openModalContaCartao('CARTAO')">
                    <i data-lucide="plus"></i> Novo Cartão
                </button>
            </div>
            
            <div class="cartoes-grid">
                ${this.state.cards.length === 0 ? '<p class="text-gray">Nenhum cartão cadastrado.</p>' : ''}
                
                ${this.state.cards.map(card => {
                    const percent = card.limite > 0 ? (card.limite_disponivel / card.limite) * 100 : 0;
                    const bank = this.getBankDetails(card.nome);
                    return `
                        <div class="credit-card-ui ${bank.class}" onclick="app.openModalDetalhesCartao(${card.id})" style="cursor: pointer;">
                            <div class="card-top">
                                <span class="card-brand">${card.nome}</span>
                                <div class="card-logo-container">${bank.logo || '<div class="card-chip"></div>'}</div>
                            </div>
                            <div class="card-middle">
                                <div class="card-limit-info">
                                    <span>Limite Disponível</span>
                                    <span>${fmt(card.limite_disponivel)} / ${fmt(card.limite)}</span>
                                </div>
                                <div class="progress-bar-wrapper">
                                    <div class="progress-bar-fill" style="width: ${percent}%"></div>
                                </div>
                            </div>
                            <div class="card-bottom">
                                <div style="display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.75rem; text-align: left; align-items: flex-start;">
                                    <span class="card-name" style="margin: 0; line-height: 1;">${card.conta_bancaria_nome || ''}</span>
                                    ${card.pessoa ? `<span style="font-size: 0.65rem; opacity: 0.7; line-height: 1;">Titular: ${card.pessoa}</span>` : ''}
                                </div>
                                <div class="card-actions-wrapper" style="display: flex; gap: 0.4rem;">
                                    <button class="card-action-btn btn-secondary-card" onclick="event.stopPropagation(); app.openModalDetalhesCartao(${card.id})" style="background: rgba(255,255,255,0.1); color: var(--text-color); border: 1px solid var(--glass-border);">
                                        Detalhes
                                    </button>
                                    <button class="card-action-btn" onclick="event.stopPropagation(); app.openModalPagarFatura(${card.id}, '${card.nome}', 0)">
                                        Pagar Fatura
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderFaturas() {
        const viewPanel = document.getElementById('app-view');
        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
        const payments = this.state.billPayments || [];
        
        // Define cartão e mês selecionados padrão
        if (!this.state.selectedFaturaCardId && this.state.cards.length > 0) {
            this.state.selectedFaturaCardId = this.state.cards[0].id;
        }
        if (!this.state.selectedFaturaMonth || this.state.selectedFaturaMonth !== this.state.currentMonth) {
            this.state.selectedFaturaMonth = this.state.currentMonth;
        }

        const allFaturas = this.state.allFaturas || [];
        const filteredFaturas = allFaturas.filter(f => {
            const matchesMonth = f.mes === this.state.currentMonth;
            const matchesPending = this.state.onlyPendingFaturas ? f.status !== 'PAGO' : true;
            
            let matchesPeriodo = true;
            const cutoff = this.state.dia_corte || 14;
            if (this.state.filters.periodo === 'ATE_CORTE') {
                matchesPeriodo = f.dia_vencimento <= cutoff;
            } else if (this.state.filters.periodo === 'DEPOIS_CORTE') {
                matchesPeriodo = f.dia_vencimento > cutoff;
            }
            
            return matchesMonth && matchesPending && matchesPeriodo;
        });
        
        viewPanel.innerHTML = `
            <!-- Catálogo de Faturas -->
            <div class="glass glass-card" style="padding: 1.8rem; margin-bottom: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.2rem; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <h3 style="font-weight: 700; font-size: 1.2rem; margin-bottom: 0.2rem;">Catálogo de Faturas</h3>
                        <p class="text-gray" style="font-size: 0.82rem;">Visualize todas as faturas geradas de seus cartões e clique para detalhar/pagar.</p>
                    </div>
                    <div style="display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap;">
                        <!-- Filtro de Vencimento -->
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <label for="fatura-filter-periodo" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 500;">Vencimento:</label>
                            <select id="fatura-filter-periodo" class="glass-select" style="padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.82rem;" onchange="app.setFilterPeriodoFaturas(this.value)">
                                <option value="" ${this.state.filters.periodo === '' ? 'selected' : ''}>Todos os Dias</option>
                                <option value="ATE_CORTE" ${this.state.filters.periodo === 'ATE_CORTE' ? 'selected' : ''}>Até o dia ${this.state.dia_corte}</option>
                                <option value="DEPOIS_CORTE" ${this.state.filters.periodo === 'DEPOIS_CORTE' ? 'selected' : ''}>A partir do dia ${this.state.dia_corte + 1}</option>
                            </select>
                        </div>
                        
                        <!-- Checkbox Pendentes -->
                        <label class="checkbox-label" style="font-size: 0.85rem; display: flex; align-items: center; gap: 0.6rem; cursor: pointer; padding: 0.4rem 0.8rem; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 8px; margin: 0;">
                            <input type="checkbox" id="filtro-faturas-pendentes" onchange="app.onFiltroFaturasPendentesChange(this.checked)" ${this.state.onlyPendingFaturas ? 'checked' : ''}>
                            <span>Mostrar apenas faturas não pagas</span>
                        </label>
                    </div>
                </div>
                
                <div class="faturas-catalog-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 1.2rem;">
                    ${filteredFaturas.length === 0 ? '<p class="text-gray" style="grid-column: 1/-1; text-align: center; padding: 1.5rem 0;">Nenhuma fatura encontrada com os filtros selecionados.</p>' : ''}
                    
                    ${filteredFaturas.map(f => {
                        const cardMeta = this.getBankDetails(f.cartao_nome);
                        const [ano, mes] = f.mes.split('-');
                        const mesFormat = `${mes}/${ano}`;
                        
                        let badgeStyle = '';
                        let badgeText = '';
                        if (f.status === 'PAGO') {
                            badgeStyle = 'background: rgba(34, 197, 94, 0.12); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2);';
                            badgeText = 'PAGO';
                        } else if (f.status === 'PARCIAL') {
                            badgeStyle = 'background: rgba(249, 115, 22, 0.12); color: #f97316; border: 1px solid rgba(249, 115, 22, 0.2);';
                            badgeText = 'PARCIAL';
                        } else {
                            badgeStyle = 'background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);';
                            badgeText = 'PENDENTE';
                        }
                        
                        const isSelected = f.cartao_id === this.state.selectedFaturaCardId && f.mes === this.state.selectedFaturaMonth;
                        const borderAccent = isSelected ? `border: 2px solid ${cardMeta.color || 'var(--solid-white)'};` : 'border: 1px solid var(--glass-border);';
                        const glowEffect = isSelected ? `box-shadow: 0 0 15px rgba(255,255,255,0.05); transform: translateY(-3px);` : '';

                        return `
                            <div class="glass" style="padding: 1.2rem; border-radius: 12px; cursor: pointer; transition: all 0.3s; ${borderAccent} ${glowEffect}" 
                                 onclick="app.selectFaturaCatalog(${f.cartao_id}, '${f.mes}')"
                                 onmouseover="this.style.background='var(--glass-bg-hover)'; this.style.transform='translateY(-3px)'"
                                 onmouseout="this.style.background='var(--glass-bg)'; if(!${isSelected}) this.style.transform='translateY(0)'">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.8rem;">
                                    <span style="font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">${f.cartao_nome}</span>
                                    <span class="badge" style="font-size: 0.65rem; padding: 0.15rem 0.4rem; border-radius: 4px; ${badgeStyle}">${badgeText}</span>
                                </div>
                                <div style="font-size: 1.3rem; font-weight: 800; color: var(--solid-white); margin-bottom: 0.3rem;">
                                    ${fmt(f.valor_total)}
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; border-top: 1px dashed var(--glass-border); padding-top: 0.5rem;">
                                    <span>Mês: <strong>${mesFormat}</strong></span>
                                    <span>Venc: <strong>Dia ${f.dia_vencimento}</strong></span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Âncora para rolagem -->
            <div id="fatura-detalhes-ancora" style="margin-top: 1rem;"></div>
            
            <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 1.8rem; align-items: start;">
                <!-- Coluna Esquerda: Cartões e Seleção de Fatura -->
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div class="glass glass-card" style="padding: 1.5rem;">
                        <h3 style="margin-bottom: 1.2rem; font-weight: 600; font-size: 1.05rem;">Selecionar Cartão & Mês</h3>
                        
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label for="fatura-select-card">Cartão de Crédito</label>
                            <select id="fatura-select-card" class="glass-select" onchange="app.onFaturaViewCardChange(this.value)">
                                ${this.state.cards.map(c => `
                                    <option value="${c.id}" ${c.id === this.state.selectedFaturaCardId ? 'selected' : ''}>${c.nome}</option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <div class="form-group" style="margin-bottom: 0.5rem;">
                            <label for="fatura-select-month">Mês da Fatura</label>
                            <input type="month" id="fatura-select-month" class="glass-input" value="${this.state.selectedFaturaMonth}" onchange="app.onFaturaViewMonthChange(this.value)">
                        </div>
                    </div>
                    
                    <!-- Resumo da Fatura Selecionada -->
                    <div class="glass glass-card" id="fatura-card-resumo-details" style="padding: 1.5rem;">
                        <div class="text-gray" style="text-align: center;">Carregando detalhes...</div>
                    </div>
                </div>
                
                <!-- Coluna Direita: Lançamentos da Fatura Selecionada -->
                <div class="glass glass-card" style="padding: 1.8rem;">
                    <h3 style="margin-bottom: 1.2rem; font-weight: 600; font-size: 1.1rem;" id="fatura-lancamentos-title">
                        Lançamentos da Fatura
                    </h3>
                    
                    <div class="table-responsive" style="max-height: 350px; overflow-y: auto;">
                        <table class="glass-table" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Descrição</th>
                                    <th>Categoria</th>
                                    <th>Valor</th>
                                </tr>
                            </thead>
                            <tbody id="fatura-lancamentos-tbody">
                                <tr><td colspan="4" class="text-gray" style="text-align: center; padding: 1.5rem;">Selecione um cartão e mês para carregar os lançamentos.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- Histórico de Pagamentos de Faturas -->
            <div class="glass glass-card" style="margin-top: 2rem; padding: 1.8rem;">
                <h3 style="margin-bottom: 1.2rem; font-weight: 600; font-size: 1.1rem;">Histórico de Pagamentos de Faturas</h3>
                <div class="table-responsive">
                    <table class="glass-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>Data Pagamento</th>
                                <th>Cartão</th>
                                <th>Mês Pago</th>
                                <th>Conta de Débito</th>
                                <th>Valor Pago</th>
                                <th style="width: 100px; text-align: center;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${payments.length === 0 ? '<tr><td colspan="6" class="text-gray" style="text-align: center; padding: 1.5rem;">Nenhum pagamento de fatura registrado.</td></tr>' : ''}
                            ${payments.map(p => {
                                const payDateParts = p.data.split('-');
                                const payDateFormatted = `${payDateParts[2]}/${payDateParts[1]}/${payDateParts[0]}`;
                                
                                let monthFormatted = p.fatura_mes || '';
                                if (p.fatura_mes) {
                                    const [y, m] = p.fatura_mes.split('-');
                                    monthFormatted = `${m}/${y}`;
                                }
                                
                                return `
                                    <tr>
                                        <td>${payDateFormatted}</td>
                                        <td style="font-weight: 600;">${p.cartao_credito_nome || 'Cartão Excluído'}</td>
                                        <td><span class="badge badge-status">${monthFormatted}</span></td>
                                        <td>${p.conta_origem_nome || 'Conta Excluída'}</td>
                                        <td style="font-weight: 600; color: #ff4444;">${fmt(p.valor)}</td>
                                        <td style="text-align: center;">
                                            <button class="btn-icon" onclick="app.handleEstornoFatura(${p.id})" title="Estornar/Reverter Pagamento" style="color: #ffaa00; background: none; border: none; cursor: pointer; padding: 4px;">
                                                <i data-lucide="rotate-ccw"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        lucide.createIcons();
        this.loadAndRenderFaturaDetails();
    }

    onFiltroFaturasPendentesChange(checked) {
        this.state.onlyPendingFaturas = checked;
        this.renderFaturas();
    }

    selectFaturaCatalog(cardId, mes) {
        this.state.selectedFaturaCardId = cardId;
        this.state.selectedFaturaMonth = mes;
        
        const cardSelect = document.getElementById('fatura-select-card');
        const monthInput = document.getElementById('fatura-select-month');
        
        if (cardSelect) cardSelect.value = cardId;
        if (monthInput) monthInput.value = mes;
        
        this.loadAndRenderFaturaDetails();
        
        const detailsEl = document.getElementById('fatura-detalhes-ancora');
        if (detailsEl) {
            detailsEl.scrollIntoView({ behavior: 'smooth' });
        }
        this.renderFaturas(); // Atualiza bordas dos cards no catálogo
    }

    onFaturaViewCardChange(cardId) {
        this.state.selectedFaturaCardId = parseInt(cardId);
        this.loadAndRenderFaturaDetails();
    }

    onFaturaViewMonthChange(month) {
        this.state.selectedFaturaMonth = month;
        this.loadAndRenderFaturaDetails();
    }

    async loadAndRenderFaturaDetails() {
        const cardId = this.state.selectedFaturaCardId;
        const mes = this.state.selectedFaturaMonth;
        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
        
        const card = this.state.cards.find(c => c.id === cardId);
        if (!card || !mes) return;

        document.getElementById('fatura-lancamentos-title').textContent = `Lançamentos da Fatura: ${card.nome} (${mes})`;

        try {
            const res = await fetch(`/api/transacoes?cartao_credito_id=${cardId}&mes=${mes}`);
            const transacoes = await res.json();
            
            const tbody = document.getElementById('fatura-lancamentos-tbody');
            tbody.innerHTML = '';
            
            let totalFatura = 0;
            
            if (transacoes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-gray" style="text-align: center; padding: 1.5rem;">Nenhum lançamento nesta fatura.</td></tr>';
            } else {
                transacoes.forEach(t => {
                    totalFatura += t.valor;
                    const parts = t.data.split('-');
                    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${formattedDate}</td>
                        <td>${t.descricao} ${t.total_parcelas ? `<small class="text-gray">(${t.numero_parcela}/${t.total_parcelas})</small>` : ''}</td>
                        <td>${t.categoria_nome || 'Sem Categoria'}</td>
                        <td style="font-weight: 600;">${fmt(t.valor)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
            
            const faturaInfo = (this.state.allFaturas || []).find(f => f.cartao_id === cardId && f.mes === mes);
            
            let statusLabel = '';
            let statusColor = '#ef4444'; // Vermelho por padrão (Pendente)
            
            if (faturaInfo) {
                if (faturaInfo.status === 'PAGO') {
                    statusLabel = `<span class="badge badge-status pago" style="background: #22c55e; color: #fff; font-size: 0.8rem; padding: 0.3rem 0.6rem;">PAGA</span>`;
                    statusColor = '#22c55e';
                } else if (faturaInfo.status === 'PARCIAL') {
                    statusLabel = `<span class="badge badge-status" style="background: #f97316; color: #fff; font-size: 0.8rem; padding: 0.3rem 0.6rem;">PARCIAL (Pago ${fmt(faturaInfo.valor_pago)})</span>`;
                    statusColor = '#f97316';
                } else {
                    statusLabel = `<span class="badge badge-status" style="background: #ef4444; color: #fff; font-size: 0.8rem; padding: 0.3rem 0.6rem;">PENDENTE</span>`;
                    statusColor = '#ef4444';
                }
            } else {
                statusLabel = `<span class="badge badge-status" style="background: #ef4444; color: #fff; font-size: 0.8rem; padding: 0.3rem 0.6rem;">PENDENTE</span>`;
                statusColor = '#ef4444';
            }
                
            const resumoDiv = document.getElementById('fatura-card-resumo-details');
            resumoDiv.innerHTML = `
                <div style="text-align: center; padding: 1.2rem 0; border-bottom: 1px solid var(--glass-border); margin-bottom: 1.2rem;">
                    <span class="text-gray" style="font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500;">Valor da Fatura</span>
                    <div style="font-size: 2.2rem; font-weight: 800; color: ${statusColor}; text-shadow: 0 0 20px ${statusColor}33; margin-top: 0.3rem;">
                        ${fmt(totalFatura)}
                    </div>
                    <div style="margin-top: 0.8rem;">
                        ${statusLabel}
                    </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 0.8rem; font-size: 0.88rem;">
                    <div style="display: flex; justify-content: space-between;">
                        <span class="text-gray">Limite Total do Cartão:</span>
                        <span style="font-weight: 600; color: var(--text-color);">${fmt(card.limite)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span class="text-gray">Limite Disponível:</span>
                        <span style="font-weight: 600; color: var(--text-color);">${fmt(card.limite_disponivel)}</span>
                    </div>
                    
                    ${(!faturaInfo || faturaInfo.status !== 'PAGO') && totalFatura > 0 ? `
                        <button class="btn btn-primary" onclick="app.openModalPagarFatura(${card.id}, '${card.nome}', ${totalFatura - (faturaInfo ? faturaInfo.valor_pago : 0)})" style="margin-top: 1rem; width: 100%;">
                            Pagar esta Fatura
                        </button>
                    ` : ''}
                </div>
            `;
            
        } catch (err) {
            console.error("Erro ao carregar detalhes da fatura:", err);
        }
    }

    renderOrcamentos() {
        const viewPanel = document.getElementById('app-view');
        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        viewPanel.innerHTML = `
            <div class="panel-header-row">
                <h2>Metas de Limite de Gastos (Orçamentos)</h2>
                <div style="display: flex; gap: 0.8rem;">
                    <button class="btn btn-secondary" onclick="window.location.hash = '#/configuracoes'">
                        <i data-lucide="plus-circle"></i> Criar Categoria
                    </button>
                    <button class="btn btn-primary" onclick="app.openModalCategoriaOrcamento()">
                        <i data-lucide="sliders"></i> Definir Orçamento
                    </button>
                </div>
            </div>

            <div class="budgets-grid">
                ${this.state.budgets.length === 0 ? '<p class="text-gray">Nenhum orçamento configurado para este mês.</p>' : ''}
                
                ${this.state.budgets.map(b => {
                    const pct = Math.min(b.porcentagem, 100);
                    const isExceeded = b.gasto > b.limite;
                    
                    return `
                        <div class="glass budget-card">
                            <div class="budget-header">
                                <div class="budget-cat-name">
                                    <i data-lucide="${b.categoria_icone || 'tag'}"></i>
                                    <span>${b.categoria_nome}</span>
                                </div>
                                <span class="budget-percent ${isExceeded ? 'exceeded' : ''}">${b.porcentagem.toFixed(0)}%</span>
                            </div>
                            
                            <div class="progress-bar-wrapper">
                                <div class="progress-bar-fill ${isExceeded ? 'exceeded' : ''}" style="width: ${pct}%"></div>
                            </div>
                            
                            <div class="budget-values">
                                <span>Gasto: ${fmt(b.gasto)}</span>
                                <span>Teto: ${fmt(b.limite)}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderMetas() {
        const viewPanel = document.getElementById('app-view');
        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        viewPanel.innerHTML = `
            <div class="panel-header-row">
                <h2>Metas de Poupança & Objetivos</h2>
                <button class="btn btn-primary" onclick="app.openModalMeta()">
                    <i data-lucide="plus"></i> Criar Objetivo
                </button>
            </div>

            <div class="metas-grid">
                ${this.state.metas.length === 0 ? '<p class="text-gray">Nenhum objetivo cadastrado.</p>' : ''}
                
                ${this.state.metas.map(m => {
                    const percent = m.valor_alvo > 0 ? (m.valor_poupado / m.valor_alvo) * 100 : 0;
                    const pctClamped = Math.min(percent, 100);
                    
                    let dateStr = 'Sem prazo';
                    if (m.data_limite) {
                        const parts = m.data_limite.split('-');
                        dateStr = `Meta até: ${parts[2]}/${parts[1]}/${parts[0]}`;
                    }

                    return `
                        <div class="glass meta-card">
                            <div class="meta-header">
                                <div class="meta-title">
                                    <i data-lucide="target"></i>
                                    <span>${m.nome} ${m.pessoa ? `<small class="text-gray">(${m.pessoa})</small>` : ''}</span>
                                </div>
                                <span class="meta-percent">${percent.toFixed(0)}%</span>
                            </div>
                            
                            <div class="progress-bar-wrapper">
                                <div class="progress-bar-fill" style="width: ${pctClamped}%"></div>
                            </div>
                            
                            <div class="meta-values">
                                <span>Poupado: ${fmt(m.valor_poupado)}</span>
                                <span>Alvo: ${fmt(m.valor_alvo)}</span>
                            </div>
                            
                            <div class="meta-target-date">
                                <i data-lucide="calendar"></i>
                                <span>${dateStr}</span>
                            </div>
                            
                            <div class="meta-actions">
                                <button class="btn btn-secondary" onclick="app.openModalMetaOp(${m.id}, '${m.nome}', 'ADICIONAR')">
                                    Poupando
                                </button>
                                <button class="btn btn-secondary" onclick="app.openModalMetaOp(${m.id}, '${m.nome}', 'RETIRAR')">
                                    Resgatar
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // ==================== AÇÕES / APLICATIVOS DE FILTROS ====================

    setFilterTipo(tipo) {
        this.state.filters.tipo = tipo;
        this.refreshCurrentView();
    }

    setFilterBusca(busca) {
        this.state.filters.busca = busca;
        // Debounce de busca para evitar múltiplas requisições por digitação
        if (this.buscaTimeout) clearTimeout(this.buscaTimeout);
        this.buscaTimeout = setTimeout(() => {
            this.refreshCurrentView();
        }, 300);
    }

    setFilterCategoria(catId) {
        this.state.filters.categoria_id = catId;
        this.refreshCurrentView();
    }

    setFilterParcelado(val) {
        this.state.filters.parcelado = val;
        this.refreshCurrentView();
    }

    setFilterRecorrente(val) {
        this.state.filters.recorrente = val;
        this.refreshCurrentView();
    }

    setFilterPeriodo(val) {
        this.state.filters.periodo = val;
        this.refreshCurrentView();
    }

    setFilterPeriodoFaturas(val) {
        this.state.filters.periodo = val;
        this.renderFaturas();
    }

    onSelectAllTransactions(checked) {
        const checkboxes = document.querySelectorAll('.select-transaction-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
        });
        this.onSelectTransactionChange();
    }

    onSelectTransactionChange() {
        const checkboxes = document.querySelectorAll('.select-transaction-checkbox');
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        
        const bulkBar = document.getElementById('bulk-edit-bar');
        const countSpan = document.getElementById('bulk-selected-count');
        const selectAllCheckbox = document.getElementById('select-all-transactions');
        
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
        }

        if (checkedCount > 0) {
            if (bulkBar) bulkBar.style.display = 'flex';
            if (countSpan) countSpan.textContent = checkedCount;
        } else {
            if (bulkBar) bulkBar.style.display = 'none';
        }
    }

    async applyBulkCategory() {
        const checkboxes = document.querySelectorAll('.select-transaction-checkbox');
        const selectedIds = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => parseInt(cb.value));

        if (selectedIds.length === 0) return;

        const catSelect = document.getElementById('bulk-category-select');
        const categoriaId = catSelect ? catSelect.value : '';

        if (!categoriaId) {
            this.showAlert("Por favor, selecione uma categoria para aplicar.");
            return;
        }

        try {
            const response = await fetch('/api/transacoes/bulk-update-categoria', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ids: selectedIds,
                    categoria_id: categoriaId
                })
            });

            if (response.ok) {
                this.showAlert(`${selectedIds.length} transações atualizadas com sucesso!`, "Sucesso");
                this.refreshCurrentView();
            } else {
                const data = await response.json();
                this.showAlert(data.error || "Erro ao atualizar categorias em lote.");
            }
        } catch (err) {
            console.error("Erro no bulk update:", err);
            this.showAlert("Erro de rede ao processar alteração em lote.");
        }
    }

    async openModalDetalhesConta(accountId) {
        const acc = this.state.accounts.find(a => a.id === accountId);
        if (!acc) return;

        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        document.getElementById('detalhes-conta-titulo').textContent = `Conta: ${acc.nome}`;
        document.getElementById('detalhes-conta-saldo').textContent = fmt(acc.saldo_atual);
        document.getElementById('detalhes-conta-tipo').textContent = acc.tipo;
        document.getElementById('detalhes-conta-banco').textContent = acc.banco || 'Não informado';
        document.getElementById('detalhes-conta-agencia-numero').textContent = `Ag: ${acc.agencia || '-'} / CC: ${acc.numero_conta || '-'}`;
        document.getElementById('detalhes-conta-pessoa').textContent = acc.pessoa || 'Compartilhado';

        try {
            const res = await fetch(`/api/transacoes?conta_id=${accountId}&mes=${this.state.currentMonth}`);
            const transacoes = await res.json();
            
            const tbody = document.getElementById('detalhes-conta-transacoes');
            tbody.innerHTML = '';
            
            if (transacoes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-gray" style="text-align: center; padding: 1.5rem;">Nenhum lançamento nesta conta.</td></tr>';
            } else {
                transacoes.forEach(t => {
                    const parts = t.data.split('-');
                    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    
                    let valStyle = '';
                    let displayValue = fmt(t.valor);
                    let typeText = t.tipo;
                    
                    if (t.tipo === 'RECEITA') {
                        valStyle = 'color: #22c55e;';
                        displayValue = `+ ${displayValue}`;
                    } else if (t.tipo === 'DESPESA') {
                        valStyle = 'color: #ef4444;';
                        displayValue = `- ${displayValue}`;
                    } else if (t.tipo === 'TRANSFERENCIA') {
                        if (t.conta_origem_id === accountId) {
                            valStyle = 'color: #ef4444;';
                            displayValue = `- ${displayValue}`;
                            typeText = 'TRANSF (Saída)';
                        } else {
                            valStyle = 'color: #22c55e;';
                            displayValue = `+ ${displayValue}`;
                            typeText = 'TRANSF (Entrada)';
                        }
                    }

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${formattedDate}</td>
                        <td>${t.descricao}</td>
                        <td><span class="badge">${typeText}</span></td>
                        <td style="font-weight: 600; ${valStyle}">${displayValue}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        } catch (err) {
            console.error("Erro ao carregar lançamentos da conta:", err);
        }

        document.getElementById('btn-editar-conta').onclick = () => {
            this.closeModal('modal-detalhes-conta');
            this.openModalEditConta(accountId);
        };
        document.getElementById('btn-excluir-conta').onclick = () => {
            this.handleDeletarConta(accountId);
        };

        this.openModal('modal-detalhes-conta');
    }

    getBankDetails(name) {
        const n = (name || '').toLowerCase();
        if (n.includes('nubank') || n.includes('roxinho')) {
            return {
                class: 'card-nubank',
                logo: `<img src="/src/nubank-logo.png" alt="Nubank" style="width: 32px; height: 32px; object-fit: contain;">`,
                color: '#a72af0'
            };
        }
        if (n.includes('itaú') || n.includes('itau')) {
            return {
                class: 'card-itau',
                logo: `<img src="/src/itau-logo.jpg" alt="Itaú" style="width: 32px; height: 32px; object-fit: contain; border-radius: 6px;">`,
                color: '#ff7a00'
            };
        }
        if (n.includes('bradesco')) {
            return {
                class: 'card-bradesco',
                logo: `<img src="/src/bradesco-logo.jpg" alt="Bradesco" style="width: 32px; height: 32px; object-fit: contain; border-radius: 6px;">`,
                color: '#cc092f'
            };
        }
        if (n.includes('mercado pago') || n.includes('mercadopago') || n.includes('mercado-pago')) {
            return {
                class: 'card-mp',
                logo: `<img src="/src/mercado-pago-logo.png" alt="Mercado Pago" style="width: 32px; height: 32px; object-fit: contain;">`,
                color: '#009ee3'
            };
        }
        if (n.includes('santander')) {
            return {
                class: 'card-santander',
                logo: `<svg viewBox="0 0 24 24" fill="currentColor" style="width: 32px; height: 32px; color: var(--card-accent-color);"><path d="M12 2C8 6 6 9 6 12a6 6 0 0 0 12 0c0-3-2-6-6-10z" /></svg>`,
                color: '#ec0000'
            };
        }
        if (n.includes('banco do brasil') || n.includes(' do brasil') || n.includes('bb')) {
            return {
                class: 'card-bb',
                logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 32px; height: 32px; color: var(--card-accent-color);"><rect x="5" y="5" width="8" height="8" transform="rotate(45 9 9)" /><rect x="9" y="9" width="8" height="8" transform="rotate(45 13 13)" /></svg>`,
                color: '#ffd700'
            };
        }
        if (n.includes('inter')) {
            return {
                class: 'card-inter',
                logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 32px; height: 32px; color: var(--card-accent-color);"><rect x="3" y="3" width="18" height="18" rx="4"/><text x="12" y="14" font-size="6" font-weight="900" text-anchor="middle" fill="currentColor">inter</text></svg>`,
                color: '#ff7a00'
            };
        }
        if (n.includes('caixa')) {
            return {
                class: 'card-caixa',
                logo: `<svg viewBox="0 0 24 24" fill="currentColor" style="width: 32px; height: 32px; color: var(--card-accent-color);"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 7h6v2H9zM7 9h10v6H7z" fill="var(--bg-color)"/></svg>`,
                color: '#005ca9'
            };
        }
        return {
            class: 'card-default',
            logo: '',
            color: '#ffffff'
        };
    }

    // ==================== AÇÕES DE MODAIS ====================

    openModal(modalId) {
        document.getElementById(modalId).classList.add('show');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }

    showAlert(message, title = 'Aviso') {
        document.getElementById('custom-alert-title').textContent = title;
        document.getElementById('custom-alert-message').textContent = message;
        this.openModal('custom-alert-modal');
        lucide.createIcons();
    }

    showConfirm(message, title = 'Confirmar Ação', options = {}) {
        return new Promise((resolve) => {
            document.getElementById('custom-confirm-title').textContent = title;
            document.getElementById('custom-confirm-message').textContent = message;
            
            const btnCancel = document.getElementById('custom-confirm-btn-no');
            const btnYes = document.getElementById('custom-confirm-btn-yes');
            const btnThird = document.getElementById('custom-confirm-btn-third');
            
            btnCancel.textContent = options.cancelText || 'Cancelar';
            btnYes.textContent = options.confirmText || 'Confirmar';
            
            if (options.showThird) {
                btnThird.style.display = 'block';
                btnThird.textContent = options.thirdText || 'Outro';
            } else {
                btnThird.style.display = 'none';
            }
            
            this.confirmResolve = resolve;
            this.openModal('custom-confirm-modal');
            lucide.createIcons();
        });
    }

    closeCustomAlert() {
        this.closeModal('custom-alert-modal');
    }

    closeCustomConfirm(result) {
        this.closeModal('custom-confirm-modal');
        if (this.confirmResolve) {
            this.confirmResolve(result);
            this.confirmResolve = null;
        }
    }

    // Nova Transação Modal
    openModalTransacao() {
        const today = new Date();
        document.getElementById('t-id').value = '';
        document.querySelector('#modal-transacao h2').textContent = 'Nova Transação';
        document.getElementById('group-parcelamento').style.display = 'flex';
        document.getElementById('group-salvar-proxima').style.display = 'block';
        document.getElementById('form-transacao').reset();
        document.getElementById('t-data').value = today.toISOString().split('T')[0];
        
        // Dispara mudanças de estado do formulário para exibir campos padrões
        this.onTipoTransacaoChange();
        this.openModal('modal-transacao');
    }

    openModalEditTransacao(id) {
        const t = this.state.transactions.find(x => x.id === id);
        if (!t) return;

        document.getElementById('t-id').value = t.id;
        document.querySelector('#modal-transacao h2').textContent = 'Editar Transação';
        
        // Oculta parcelamento ao editar para evitar inconsistências em séries de parcelas
        document.getElementById('group-parcelamento').style.display = 'none';
        document.getElementById('group-salvar-proxima').style.display = 'none';

        // Selecionar tipo
        const typeRadio = document.querySelector(`input[name="tipo"][value="${t.tipo}"]`);
        if (typeRadio) {
            typeRadio.checked = true;
        }
        
        // Forçar renderização de layout baseado no tipo
        this.onTipoTransacaoChange();

        // Preencher campos
        document.getElementById('t-descricao').value = t.descricao;
        document.getElementById('t-valor').value = t.valor;
        document.getElementById('t-data').value = t.data;
        document.getElementById('t-categoria').value = t.categoria_id || '';
        document.getElementById('t-pagador').value = t.pagador_recebedor || '';
        document.getElementById('t-pessoa').value = t.pessoa || 'Compartilhado';
        document.getElementById('t-confirmado').checked = t.pago_ou_confirmado;
        document.getElementById('t-recorrente').checked = t.recorrente;

        if (t.tipo === 'DESPESA') {
            if (t.cartao_credito_id) {
                document.getElementById('t-forma-pagamento').value = 'CARTAO';
                this.onFormaPagamentoChange();
                document.getElementById('t-cartao').value = t.cartao_credito_id;
            } else {
                document.getElementById('t-forma-pagamento').value = 'CONTA';
                this.onFormaPagamentoChange();
                document.getElementById('t-conta-origem').value = t.conta_origem_id || '';
            }
        } else if (t.tipo === 'RECEITA') {
            document.getElementById('t-conta-destino').value = t.conta_destino_id || '';
        } else if (t.tipo === 'TRANSFERENCIA') {
            document.getElementById('t-conta-origem').value = t.conta_origem_id || '';
            document.getElementById('t-conta-destino').value = t.conta_destino_id || '';
        }

        this.openModal('modal-transacao');
    }

    onTipoTransacaoChange() {
        const tipo = document.querySelector('input[name="tipo"]:checked').value;
        
        const grpCategoria = document.getElementById('group-categoria');
        const grpContaOrigem = document.getElementById('group-conta-origem');
        const grpContaDestino = document.getElementById('group-conta-destino');
        const grpFormaPagamento = document.getElementById('group-forma-pagamento');
        const grpCartao = document.getElementById('group-cartao');
        const grpParcelamento = document.getElementById('group-parcelamento');
        const grpPagadorRecebedor = document.getElementById('group-pagador-recebedor');
        const grpConfirmado = document.getElementById('group-confirmado');
        const grpRecorrente = document.getElementById('group-recorrente');
        
        const labelContaOrigem = document.getElementById('label-conta-origem');
        const labelPagador = document.getElementById('label-pagador');
        const labelConfirmado = document.getElementById('label-confirmado');
        const labelRecorrente = document.getElementById('label-recorrente');

        // Atualiza as categorias correspondentes
        this.fillCategoriasSelect();

        if (tipo === 'RECEITA') {
            if (labelRecorrente) labelRecorrente.textContent = 'Receita Fixa';
            grpCategoria.style.display = '';
            grpContaOrigem.style.display = 'none';
            grpContaDestino.style.display = '';
            grpFormaPagamento.style.display = 'none';
            grpCartao.style.display = 'none';
            grpParcelamento.style.display = 'none';
            grpPagadorRecebedor.style.display = '';
            grpConfirmado.style.display = '';
            grpRecorrente.style.display = '';
            
            labelPagador.textContent = 'Payer / Origem';
            labelConfirmado.textContent = 'Confirmado / Recebido';
        } else if (tipo === 'DESPESA') {
            if (labelRecorrente) labelRecorrente.textContent = 'Despesa Fixa';
            grpCategoria.style.display = '';
            grpContaOrigem.style.display = '';
            grpContaDestino.style.display = 'none';
            grpFormaPagamento.style.display = '';
            grpParcelamento.style.display = '';
            grpPagadorRecebedor.style.display = '';
            grpConfirmado.style.display = '';
            grpRecorrente.style.display = '';
            
            labelContaOrigem.textContent = 'Conta de Origem';
            labelPagador.textContent = 'Fornecedor / Destinatário';
            labelConfirmado.textContent = 'Confirmado / Pago';
            
            this.onFormaPagamentoChange();
        } else if (tipo === 'TRANSFERENCIA') {
            grpCategoria.style.display = 'none';
            grpContaOrigem.style.display = '';
            grpContaDestino.style.display = '';
            grpFormaPagamento.style.display = 'none';
            grpCartao.style.display = 'none';
            grpParcelamento.style.display = 'none';
            grpPagadorRecebedor.style.display = 'none';
            grpConfirmado.style.display = '';
            grpRecorrente.style.display = 'none';
            
            labelContaOrigem.textContent = 'Conta de Origem';
            labelConfirmado.textContent = 'Executada';
        }
    }

    onFormaPagamentoChange() {
        const fp = document.getElementById('t-forma-pagamento').value;
        const grpContaOrigem = document.getElementById('group-conta-origem');
        const grpCartao = document.getElementById('group-cartao');
        const grpConfirmado = document.getElementById('group-confirmado');
        const grpParcelamento = document.getElementById('group-parcelamento');

        if (fp === 'CONTA') {
            grpContaOrigem.style.display = '';
            grpCartao.style.display = 'none';
            grpConfirmado.style.display = '';
            grpParcelamento.style.display = 'none';
            document.getElementById('t-parcelado').checked = false;
            this.onParceladoChange();
        } else {
            grpContaOrigem.style.display = 'none';
            grpCartao.style.display = '';
            grpConfirmado.style.display = 'none'; // Despesa de cartão de crédito não é conciliada manualmente de imediato
            grpParcelamento.style.display = '';
        }
    }

    onParceladoChange() {
        const isParcelado = document.getElementById('t-parcelado').checked;
        const grpQtd = document.getElementById('group-parcelas-qtd');
        
        if (isParcelado) {
            grpQtd.style.display = '';
        } else {
            grpQtd.style.display = 'none';
        }
    }

    // Modal Conta / Cartão
    openModalContaCartao(tipo = 'CONTA') {
        this.state.editingAccountId = null;
        this.state.editingCardId = null;

        // Exibe a escolha de tipo (caso estivesse oculta pela edição)
        document.querySelector('.row-radio').style.display = '';
        document.querySelector('#modal-conta-cartao h2').textContent = 'Adicionar Conta ou Cartão';

        document.getElementById('form-conta').reset();
        document.getElementById('form-cartao').reset();
        document.getElementById('card-conta-pagamento').value = '';
        
        const rInput = document.querySelector(`input[name="item-tipo"][value="${tipo}"]`);
        if (rInput) {
            rInput.checked = true;
            this.onItemTipoChange();
        }
        
        this.openModal('modal-conta-cartao');
    }

    onItemTipoChange() {
        const val = document.querySelector('input[name="item-tipo"]:checked').value;
        const formConta = document.getElementById('form-conta');
        const formCartao = document.getElementById('form-cartao');

        if (val === 'CONTA') {
            formConta.style.display = 'block';
            formCartao.style.display = 'none';
        } else {
            formConta.style.display = 'none';
            formCartao.style.display = 'block';
        }
    }

    openModalEditCartao(cardId) {
        const card = this.state.cards.find(c => c.id === cardId);
        if (!card) return;

        this.state.editingCardId = cardId;
        this.state.editingAccountId = null;

        // Preenche o formulário do cartão
        document.getElementById('card-nome').value = card.nome;
        document.getElementById('card-limite').value = card.limite;
        document.getElementById('card-fechamento').value = card.dia_fechamento;
        document.getElementById('card-vencimento').value = card.dia_vencimento;
        document.getElementById('card-pessoa').value = card.pessoa || 'Compartilhado';
        document.getElementById('card-conta-pagamento').value = card.conta_bancaria_id || '';

        // Exibe form do cartão e oculta o de conta
        const rInput = document.querySelector('input[name="item-tipo"][value="CARTAO"]');
        if (rInput) rInput.checked = true;
        this.onItemTipoChange();

        // Oculta a escolha de tipo porque estamos editando um item específico
        document.querySelector('.row-radio').style.display = 'none';

        // Muda título do modal
        document.querySelector('#modal-conta-cartao h2').textContent = 'Editar Cartão de Crédito';

        this.openModal('modal-conta-cartao');
    }

    openModalEditConta(accountId) {
        const acc = this.state.accounts.find(a => a.id === accountId);
        if (!acc) return;

        this.state.editingAccountId = accountId;
        this.state.editingCardId = null;

        // Preenche o formulário da conta
        document.getElementById('c-nome').value = acc.nome;
        document.getElementById('c-banco').value = acc.banco || '';
        document.getElementById('c-agencia').value = acc.agencia || '';
        document.getElementById('c-numero-conta').value = acc.numero_conta || '';
        document.getElementById('c-tipo').value = acc.tipo;
        document.getElementById('c-saldo').value = acc.saldo_inicial;
        document.getElementById('c-pessoa').value = acc.pessoa || 'Compartilhado';

        // Exibe form da conta e oculta o do cartão
        const rInput = document.querySelector('input[name="item-tipo"][value="CONTA"]');
        if (rInput) rInput.checked = true;
        this.onItemTipoChange();

        // Oculta a escolha de tipo porque estamos editando um item específico
        document.querySelector('.row-radio').style.display = 'none';

        // Muda título do modal
        document.querySelector('#modal-conta-cartao h2').textContent = 'Editar Conta / Carteira';

        this.openModal('modal-conta-cartao');
    }

    async handleDeletarCartao(cardId) {
        if (!confirm("Tem certeza que deseja excluir este cartão? Todas as transações associadas serão desvinculadas.")) return;

        try {
            const res = await fetch(`/api/cartoes/${cardId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Erro ao excluir cartão');

            this.closeModal('modal-detalhes-cartao');
            await this.loadBaseData();
            this.refreshCurrentView();
            this.showAlert("Cartão excluído com sucesso!");
        } catch (err) {
            alert(err.message);
        }
    }

    async handleDeletarConta(accountId) {
        if (!confirm("Tem certeza que deseja excluir esta conta bancária?")) return;

        try {
            const res = await fetch(`/api/contas/${accountId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Erro ao excluir conta');

            this.closeModal('modal-detalhes-conta');
            await this.loadBaseData();
            this.refreshCurrentView();
            this.showAlert("Conta excluída com sucesso!");
        } catch (err) {
            alert(err.message);
        }
    }

    // Modal Orçamento
    openModalCategoriaOrcamento() {
        document.getElementById('form-orcamento').reset();
        document.getElementById('orc-mes').value = this.state.currentMonth;
        this.openModal('modal-categoria-orcamento');
    }

    // Modal Meta
    openModalMeta() {
        document.getElementById('form-meta').reset();
        this.openModal('modal-meta');
    }

    // Modal Investimento
    openModalInvestimento() {
        document.getElementById('form-investimento').reset();
        const today = new Date();
        document.getElementById('inv-data').value = today.toISOString().split('T')[0];
        this.onTipoInvestimentoChange();
        this.openModal('modal-investimento');
    }

    onTipoInvestimentoChange() {
        const tipo = document.getElementById('inv-tipo').value;
        const grpTaxa = document.getElementById('inv-taxa').parentElement;
        const labelTaxa = document.getElementById('label-inv-taxa');
        const inputTaxa = document.getElementById('inv-taxa');

        if (tipo === 'CDB' || tipo === 'LCI_LCA') {
            grpTaxa.style.display = 'block';
            labelTaxa.textContent = 'Rentabilidade (% do CDI)';
            inputTaxa.value = '100.0';
            inputTaxa.required = true;
        } else if (tipo === 'PREFIXADO') {
            grpTaxa.style.display = 'block';
            labelTaxa.textContent = 'Taxa de Rendimento (% a.a.)';
            inputTaxa.value = '12.0';
            inputTaxa.required = true;
        } else {
            grpTaxa.style.display = 'none';
            inputTaxa.required = false;
            inputTaxa.value = '0.0';
        }
    }

    // Modal Pagar Fatura (corrigido bug do reset que limpava os inputs)
    openModalPagarFatura(cardId, cardNome, faturaValor = 0) {
        document.getElementById('form-pagar-fatura').reset();
        document.getElementById('fatura-cartao-id').value = cardId;
        document.getElementById('fatura-cartao-nome').value = cardNome;
        document.getElementById('fatura-mes').value = this.state.currentMonth;
        document.getElementById('fatura-valor').value = faturaValor > 0 ? faturaValor.toFixed(2) : '';
        
        // Pre-seleciona a conta vinculada se houver
        const cardObj = this.state.cards.find(c => c.id === cardId);
        if (cardObj && cardObj.conta_bancaria_id) {
            document.getElementById('fatura-conta').value = cardObj.conta_bancaria_id;
        }
        
        this.onFaturaMesChange();
        this.openModal('modal-pagar-fatura');
    }

    async onFaturaMesChange() {
        const cardId = parseInt(document.getElementById('fatura-cartao-id').value);
        const mes = document.getElementById('fatura-mes').value;
        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
        
        if (!cardId || !mes) return;

        try {
            const res = await fetch(`/api/transacoes?cartao_credito_id=${cardId}&mes=${mes}`);
            const transacoes = await res.json();
            
            const tbody = document.getElementById('fatura-transacoes-tbody');
            tbody.innerHTML = '';
            
            let totalFatura = 0;
            
            if (transacoes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-gray" style="text-align: center; padding: 1rem;">Nenhum lançamento encontrado nesta fatura.</td></tr>';
            } else {
                transacoes.forEach(t => {
                    totalFatura += t.valor;
                    const parts = t.data.split('-');
                    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${formattedDate}</td>
                        <td>${t.descricao} ${t.total_parcelas ? `<small class="text-gray">(${t.numero_parcela}/${t.total_parcelas})</small>` : ''}</td>
                        <td style="font-weight: 600;">${fmt(t.valor)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
            
            // Atualiza o valor a pagar com a soma calculada
            document.getElementById('fatura-valor').value = totalFatura.toFixed(2);
            
            // Exibe a seção de detalhes
            document.getElementById('fatura-detalhes-container').style.display = 'block';
        } catch (err) {
            console.error("Erro ao carregar detalhes da fatura para pagamento:", err);
        }
    }

    // Modal Detalhes do Cartão (Histórico da fatura do mês selecionado)
    async openModalDetalhesCartao(cardId) {
        const card = this.state.cards.find(c => c.id === cardId);
        if (!card) return;

        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        // Popula dados gerais do cartão
        document.getElementById('detalhes-cartao-titulo').textContent = `Fatura: ${card.nome}`;
        document.getElementById('detalhes-limite-total').textContent = fmt(card.limite);
        document.getElementById('detalhes-limite-disp').textContent = fmt(card.limite_disponivel);
        document.getElementById('detalhes-dia-fechamento').textContent = card.dia_fechamento;
        document.getElementById('detalhes-dia-vencimento').textContent = card.dia_vencimento;
        document.getElementById('detalhes-conta-vinculada').textContent = card.conta_bancaria_nome || 'Nenhuma conta vinculada';

        // Carrega lançamentos do cartão do mês selecionado
        try {
            const res = await fetch(`/api/transacoes?cartao_credito_id=${cardId}&mes=${this.state.currentMonth}`);
            const transacoes = await res.json();
            
            const tbody = document.getElementById('detalhes-cartao-transacoes');
            tbody.innerHTML = '';
            
            if (transacoes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-gray" style="text-align: center; padding: 1.5rem;">Nenhum lançamento nesta fatura.</td></tr>';
            } else {
                transacoes.forEach(t => {
                    const parts = t.data.split('-');
                    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${formattedDate}</td>
                        <td>${t.descricao} ${t.total_parcelas ? `<small class="text-gray">(${t.numero_parcela}/${t.total_parcelas})</small>` : ''}</td>
                        <td>${t.categoria_nome || 'Sem Categoria'}</td>
                        <td style="font-weight: 600;">${fmt(t.valor)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        } catch (err) {
            console.error("Erro ao carregar lançamentos do cartão:", err);
        }

        document.getElementById('btn-editar-cartao').onclick = () => {
            this.closeModal('modal-detalhes-cartao');
            this.openModalEditCartao(cardId);
        };
        document.getElementById('btn-excluir-cartao').onclick = () => {
            this.handleDeletarCartao(cardId);
        };

        this.openModal('modal-detalhes-cartao');
    }

    openModalTransferencia() {
        document.getElementById('form-transferencia').reset();
        
        const selectOrigem = document.getElementById('transf-origem');
        const selectDestino = document.getElementById('transf-destino');
        
        const populateSelect = (selectEl, items) => {
            selectEl.innerHTML = '';
            const optPlaceholder = document.createElement('option');
            optPlaceholder.value = '';
            optPlaceholder.textContent = 'Selecione a conta...';
            selectEl.appendChild(optPlaceholder);
            
            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = `${item.nome} (${item.tipo})`;
                selectEl.appendChild(opt);
            });
        };
        
        populateSelect(selectOrigem, this.state.accounts);
        populateSelect(selectDestino, this.state.accounts);
        
        const today = new Date();
        document.getElementById('transf-data').value = today.toISOString().split('T')[0];
        
        this.openModal('modal-transferencia');
    }

    // Modal Operação de Meta (Poupar / Resgatar)
    openModalMetaOp(metaId, metaNome, tipoOp) {
        document.getElementById('meta-op-id').value = metaId;
        document.getElementById('meta-op-nome').value = metaNome;
        document.getElementById('meta-op-tipo').value = tipoOp;
        document.getElementById('form-meta-operacao').reset();
        
        const titulo = document.getElementById('meta-op-titulo');
        const labelConta = document.getElementById('label-meta-op-conta');
        const submitBtn = document.getElementById('btn-meta-op-submit');

        if (tipoOp === 'ADICIONAR') {
            titulo.textContent = 'Adicionar Saldo à Meta';
            labelConta.textContent = 'Retirar da Conta Bancária';
            submitBtn.textContent = 'Confirmar Aporte';
        } else {
            titulo.textContent = 'Resgatar Saldo da Meta';
            labelConta.textContent = 'Depositar na Conta Bancária';
            submitBtn.textContent = 'Confirmar Resgate';
        }
        
        this.openModal('modal-meta-operacao');
    }

    // ==================== SALVAR DADOS (SUBMIT FORMS) ====================

    async handleSaveTransacao(e) {
        e.preventDefault();
        
        const tipo = document.querySelector('input[name="tipo"]:checked').value;
        const descricao = document.getElementById('t-descricao').value;
        const valor = parseFloat(document.getElementById('t-valor').value);
        const data = document.getElementById('t-data').value;
        
        const categoria_id = document.getElementById('t-categoria').value || null;
        let conta_origem_id = null;
        let conta_destino_id = null;
        let cartao_credito_id = null;
        let total_parcelas = null;
        let pago_ou_confirmado = false;
        
        const pagador_recebedor = document.getElementById('t-pagador').value || null;
        const recorrente = document.getElementById('t-recorrente').checked;

        if (tipo === 'RECEITA') {
            conta_destino_id = document.getElementById('t-conta-destino').value || null;
            pago_ou_confirmado = document.getElementById('t-confirmado').checked;
        } else if (tipo === 'DESPESA') {
            const fp = document.getElementById('t-forma-pagamento').value;
            if (fp === 'CONTA') {
                conta_origem_id = document.getElementById('t-conta-origem').value || null;
                pago_ou_confirmado = document.getElementById('t-confirmado').checked;
            } else {
                cartao_credito_id = document.getElementById('t-cartao').value || null;
                pago_ou_confirmado = false; // cartão sempre inicia pendente
            }
            
            const parcelado = document.getElementById('t-parcelado').checked;
            if (parcelado) {
                total_parcelas = parseInt(document.getElementById('t-parcelas').value);
            }
        } else if (tipo === 'TRANSFERENCIA') {
            conta_origem_id = document.getElementById('t-conta-origem').value || null;
            conta_destino_id = document.getElementById('t-conta-destino').value || null;
            pago_ou_confirmado = document.getElementById('t-confirmado').checked;
        }

        const pessoa = document.getElementById('t-pessoa').value;

        const payload = {
            tipo,
            descricao,
            valor,
            data,
            categoria_id,
            conta_origem_id,
            conta_destino_id,
            cartao_credito_id,
            total_parcelas,
            pago_ou_confirmado,
            pagador_recebedor,
            pessoa,
            recorrente
        };

        const transacaoId = document.getElementById('t-id').value;
        const isEdit = !!transacaoId;
        const method = isEdit ? 'PUT' : 'POST';
        const url = isEdit ? `/api/transacoes/${transacaoId}` : '/api/transacoes';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao salvar transação');
            }

            await this.loadBaseData();

            if (!isEdit && document.getElementById('t-salvar-proxima').checked) {
                // Limpa apenas valor, descricao, categoria
                document.getElementById('t-descricao').value = '';
                document.getElementById('t-valor').value = '';
                document.getElementById('t-categoria').value = '';
                
                // Recarrega a view atual em segundo plano
                this.refreshCurrentView();
                
                // Retorna o foco na descrição para agilizar a digitação
                document.getElementById('t-descricao').focus();
            } else {
                this.closeModal('modal-transacao');
                this.refreshCurrentView();
            }
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSaveConta(e) {
        e.preventDefault();
        const nome = document.getElementById('c-nome').value;
        const tipo = document.getElementById('c-tipo').value;
        const saldo_inicial = parseFloat(document.getElementById('c-saldo').value) || 0.0;
        const togglePessoa = document.getElementById('c-pessoa');
        const pessoa = togglePessoa ? togglePessoa.value : 'Compartilhado';
        const banco = document.getElementById('c-banco').value || null;
        const agencia = document.getElementById('c-agencia').value || null;
        const numero_conta = document.getElementById('c-numero-conta').value || null;

        const isEditing = this.state.editingAccountId !== null;
        const url = isEditing ? `/api/contas/${this.state.editingAccountId}` : '/api/contas';
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, tipo, saldo_inicial, pessoa, banco, agencia, numero_conta })
            });

            if (!res.ok) throw new Error('Erro ao salvar conta');

            this.closeModal('modal-conta-cartao');
            this.state.editingAccountId = null;
            await this.loadBaseData();
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSaveCartao(e) {
        e.preventDefault();
        const nome = document.getElementById('card-nome').value;
        const limite = parseFloat(document.getElementById('card-limite').value) || 0.0;
        const dia_fechamento = parseInt(document.getElementById('card-fechamento').value);
        const dia_vencimento = parseInt(document.getElementById('card-vencimento').value);
        const conta_bancaria_id = document.getElementById('card-conta-pagamento').value || null;
        const togglePessoa = document.getElementById('card-pessoa');
        const pessoa = togglePessoa ? togglePessoa.value : 'Compartilhado';

        const isEditing = this.state.editingCardId !== null;
        const url = isEditing ? `/api/cartoes/${this.state.editingCardId}` : '/api/cartoes';
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, limite, dia_fechamento, dia_vencimento, conta_bancaria_id, pessoa })
            });

            if (!res.ok) throw new Error('Erro ao salvar cartão');

            this.closeModal('modal-conta-cartao');
            this.state.editingCardId = null;
            await this.loadBaseData();
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSaveConfigCategoria(e) {
        e.preventDefault();
        const nome = document.getElementById('conf-cat-nome').value;
        const tipo = document.getElementById('conf-cat-tipo').value;
        const icone = document.getElementById('conf-cat-icone').value;

        try {
            const res = await fetch('/api/categorias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, tipo, icone })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao salvar categoria');
            }

            document.getElementById('conf-cat-nome').value = '';
            await this.loadBaseData();
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSaveInvestimento(e) {
        e.preventDefault();
        const nome = document.getElementById('inv-nome').value;
        const valor_aplicado = parseFloat(document.getElementById('inv-valor').value);
        const data_aplicacao = document.getElementById('inv-data').value;
        const tipo = document.getElementById('inv-tipo').value;
        const taxa = parseFloat(document.getElementById('inv-taxa').value) || 0.0;
        const pessoa = document.getElementById('inv-pessoa').value;

        try {
            const res = await fetch('/api/investimentos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, valor_aplicado, data_aplicacao, tipo, taxa, pessoa })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao cadastrar investimento');
            }

            this.closeModal('modal-investimento');
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleDeleteInvestimento(id) {
        const escolha = await this.showConfirm("Tem certeza que deseja excluir este investimento?", "Excluir Investimento");
        if (escolha !== 'confirm') return;

        try {
            const res = await fetch(`/api/investimentos/${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Erro ao excluir investimento');

            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    renderInvestimentos() {
        const viewPanel = document.getElementById('app-view');
        const d = this.state.investmentData;
        if (!d) return;

        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        viewPanel.innerHTML = `
            <!-- Painel Superior de Resumos (Minha Carteira) -->
            <h3 style="margin-bottom: 0.8rem; font-weight: 600; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">Minha Carteira</h3>
            <div class="summary-grid" style="margin-bottom: 2rem;">
                <div class="glass glass-card summary-card">
                    <div class="summary-card-header">
                        <span>Total Aplicado</span>
                        <i data-lucide="wallet"></i>
                    </div>
                    <div class="summary-card-body">
                        <div class="summary-value">${fmt(d.total_aplicado)}</div>
                    </div>
                </div>
                <div class="glass glass-card summary-card">
                    <div class="summary-card-header">
                        <span>Saldo Estimado Atual</span>
                        <i data-lucide="trending-up"></i>
                    </div>
                    <div class="summary-card-body">
                        <div class="summary-value" style="color: var(--solid-white);">${fmt(d.total_atual)}</div>
                    </div>
                </div>
                <div class="glass glass-card summary-card">
                    <div class="summary-card-header">
                        <span>Rendimento Bruto Acumulado</span>
                        <i data-lucide="line-chart"></i>
                    </div>
                    <div class="summary-card-body">
                        <div class="summary-value" style="color: var(--solid-white);">${fmt(d.total_rendimento)}</div>
                    </div>
                </div>
            </div>

            <!-- Comparativo de Taxas / Onde Investir Hoje? -->
            <h3 style="margin-bottom: 0.8rem; font-weight: 600; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">Onde Investir Hoje? (Taxas de Referência do Mês)</h3>
            <div class="summary-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 2.5rem;">
                <!-- Card 1: CDB (100% CDI) -->
                <div class="glass glass-card summary-card" style="border-left: 4px solid var(--solid-white);">
                    <div class="summary-card-header">
                        <span>CDB (100% CDI)</span>
                        <i data-lucide="percent"></i>
                    </div>
                    <div class="summary-card-body" style="margin-top: 0.8rem;">
                        <div class="summary-value" style="font-size: 1.45rem; color: var(--solid-white);">${d.taxas_referencia.cdi_mensal.toFixed(2)}% <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">a.m.</span></div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.4rem; font-weight: 500;">Equivale a: ${d.taxas_referencia.cdi_anual.toFixed(2)}% a.a.</div>
                    </div>
                </div>
                <!-- Card 2: Tesouro Selic -->
                <div class="glass glass-card summary-card" style="border-left: 4px solid #888888;">
                    <div class="summary-card-header">
                        <span>Tesouro Selic</span>
                        <i data-lucide="award"></i>
                    </div>
                    <div class="summary-card-body" style="margin-top: 0.8rem;">
                        <div class="summary-value" style="font-size: 1.45rem; color: var(--solid-white);">${d.taxas_referencia.selic_mensal.toFixed(2)}% <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">a.m.</span></div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.4rem; font-weight: 500;">Equivale a: ${d.taxas_referencia.selic_anual.toFixed(2)}% a.a.</div>
                    </div>
                </div>
                <!-- Card 3: Poupança -->
                <div class="glass glass-card summary-card" style="border-left: 4px solid #cccccc;">
                    <div class="summary-card-header">
                        <span>Poupança</span>
                        <i data-lucide="shield"></i>
                    </div>
                    <div class="summary-card-body" style="margin-top: 0.8rem;">
                        <div class="summary-value" style="font-size: 1.45rem; color: var(--solid-white);">${d.taxas_referencia.poupanca_mensal.toFixed(2)}% <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">a.m.</span></div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.4rem; font-weight: 500;">Equivale a: ${d.taxas_referencia.poupanca_anual.toFixed(2)}% a.a.</div>
                    </div>
                </div>
                <!-- Card 4: IPCA (Inflação) -->
                <div class="glass glass-card summary-card" style="border-left: 4px solid #555555;">
                    <div class="summary-card-header">
                        <span>Inflação (IPCA)</span>
                        <i data-lucide="activity"></i>
                    </div>
                    <div class="summary-card-body" style="margin-top: 0.8rem;">
                        <div class="summary-value" style="font-size: 1.45rem; color: var(--solid-white);">${d.taxas_referencia.ipca_mensal.toFixed(2)}% <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">a.m.</span></div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.4rem; font-weight: 500;">Acumulado: ${d.taxas_referencia.ipca_anual.toFixed(2)}% a.a.</div>
                    </div>
                </div>
            </div>

            <!-- Gráficos de Alocação e Evolução -->
            <div class="dashboard-details-grid" style="margin-bottom: 2rem;">
                <div class="glass glass-card chart-container-glass">
                    <h3 class="chart-title">Distribuição do Patrimônio</h3>
                    <div style="position: relative; width: 100%; height: 260px;">
                        <canvas id="chart-inv-alocacao"></canvas>
                    </div>
                </div>
                <div class="glass glass-card chart-container-glass">
                    <h3 class="chart-title">Evolução do Saldo Consolidado</h3>
                    <div style="position: relative; width: 100%; height: 260px;">
                        <canvas id="chart-inv-evolucao"></canvas>
                    </div>
                </div>
            </div>

            <!-- Lista de Ativos Cadastrados -->
            <div class="panel-header-row" style="margin-bottom: 1.2rem;">
                <h2>Meus Ativos & Investimentos</h2>
                <button class="btn btn-primary" onclick="app.openModalInvestimento()">
                    <i data-lucide="plus-circle"></i> Adicionar Investimento
                </button>
            </div>

            <div class="glass table-responsive">
                <table class="glass-table">
                    <thead>
                        <tr>
                            <th>Nome do Ativo</th>
                            <th>Tipo</th>
                            <th>Responsável</th>
                            <th>Data de Compra</th>
                            <th>Taxa / Rentabilidade</th>
                            <th>Valor Aplicado</th>
                            <th>Saldo Atual Estimado</th>
                            <th>Rendimento Bruto</th>
                            <th style="width: 80px; text-align: center;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${d.investimentos.length === 0 ? '<tr><td colspan="9" class="text-gray" style="text-align: center;">Nenhum investimento cadastrado.</td></tr>' : ''}
                        ${d.investimentos.map(inv => {
                            const dateParts = inv.data_aplicacao.split('-');
                            const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                            
                            let taxaLabel = '';
                            const mYield = inv.rendimento_mensal_atual ? inv.rendimento_mensal_atual.toFixed(2) : '0.00';
                            const aYield = inv.rendimento_anual_atual ? inv.rendimento_anual_atual.toFixed(2) : '0.00';
                            const yieldInfo = `<div class="text-gray" style="font-size: 0.72rem; margin-top: 0.2rem; font-weight: normal; white-space: nowrap;">Rend. atual: ${mYield}% a.m. ; ${aYield}% a.a.</div>`;

                            if (inv.tipo === 'CDB' || inv.tipo == 'LCI_LCA') {
                                taxaLabel = `<div style="font-weight: 600;">${inv.taxa}% do CDI</div>${yieldInfo}`;
                            } else if (inv.tipo === 'PREFIXADO') {
                                taxaLabel = `<div style="font-weight: 600;">${inv.taxa}% a.a.</div>${yieldInfo}`;
                            } else if (inv.tipo === 'TESOURO') {
                                taxaLabel = `<div style="font-weight: 600;">100% Selic</div>${yieldInfo}`;
                            } else if (inv.tipo === 'POUPANCA') {
                                taxaLabel = `<div style="font-weight: 600;">Poupança</div>${yieldInfo}`;
                            }

                            return `
                                <tr>
                                    <td style="font-weight: 600;">${inv.nome}</td>
                                    <td><span class="badge badge-status">${inv.tipo}</span></td>
                                    <td><span class="badge badge-status" style="font-size: 0.7rem; padding: 0.2rem 0.4rem;">${inv.pessoa || 'Compartilhado'}</span></td>
                                    <td>${dateFormatted}</td>
                                    <td>${taxaLabel}</td>
                                    <td>${fmt(inv.valor_aplicado)}</td>
                                    <td style="font-weight: 600; color: var(--solid-white);">${fmt(inv.valor_atual)}</td>
                                    <td style="font-weight: 600; color: var(--solid-white);">${fmt(inv.rendimento_total)}</td>
                                    <td style="text-align: center;">
                                        <button class="btn-icon" onclick="app.handleDeleteInvestimento(${inv.id})" title="Excluir Ativo" style="color: #ff4444;">
                                            <i data-lucide="trash-2"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Renderiza gráficos
        this.renderInvestimentosCharts(d);
    }

    renderInvestimentosCharts(d) {
        const ctxAloc = document.getElementById('chart-inv-alocacao').getContext('2d');
        const ctxEvol = document.getElementById('chart-inv-evolucao').getContext('2d');

        // Cores e estilos do tema
        const isLight = document.body.classList.contains('light-theme');
        const textColor = isLight ? '#000000' : '#ffffff';
        const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        const borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

        const colors = [
            '#ffffff', // Branco sólido
            '#888888', // Cinza escuro
            '#cccccc', // Cinza claro
            '#555555', // Cinza intermediário
            '#222222'  // Quase preto
        ];

        // 1. Gráfico de Alocação
        if (this.charts['inv-alocacao']) this.charts['inv-alocacao'].destroy();
        this.charts['inv-alocacao'] = new Chart(ctxAloc, {
            type: 'doughnut',
            data: {
                labels: d.alocacao.map(a => a.tipo),
                datasets: [{
                    data: d.alocacao.map(a => a.valor),
                    backgroundColor: colors.slice(0, d.alocacao.length),
                    borderColor: borderColor,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: textColor,
                            font: { family: 'Outfit', size: 12 }
                        }
                    }
                }
            }
        });

        // 2. Gráfico de Evolução
        if (this.charts['inv-evolucao']) this.charts['inv-evolucao'].destroy();
        
        // Se a evolução estiver vazia, não desenha o gráfico de linha
        if (d.evolucao.length === 0) return;

        this.charts['inv-evolucao'] = new Chart(ctxEvol, {
            type: 'line',
            data: {
                labels: d.evolucao.map(e => {
                    const parts = e.mes.split('-');
                    return `${parts[1]}/${parts[0]}`;
                }),
                datasets: [{
                    label: 'Patrimônio Consolidado',
                    data: d.evolucao.map(e => e.saldo),
                    borderColor: textColor,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: textColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Outfit' } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Outfit' } }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    async handleDeleteConfigCategoria(catId) {
        const escolha = await this.showConfirm("Tem certeza que deseja excluir esta categoria?", "Excluir Categoria");
        if (escolha !== 'confirm') return;

        try {
            const res = await fetch(`/api/categorias/${catId}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao excluir categoria');
            }

            await this.loadBaseData();
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    renderConfiguracoes() {
        const viewPanel = document.getElementById('app-view');
        const activeTab = this.state.activeSettingsTab || 'categorias';
        
        let tabContent = '';
        
        if (activeTab === 'categorias') {
            tabContent = `
                <div style="display: grid; grid-template-columns: 1fr 1.3fr; gap: 1.8rem; align-items: start;">
                    <!-- Coluna Esquerda: Cadastro de Categoria -->
                    <div class="glass glass-card" style="padding: 1.8rem;">
                        <h3 style="margin-bottom: 1.5rem; font-weight: 600; font-size: 1.1rem;">Nova Categoria</h3>
                        <form id="form-config-categoria" onsubmit="app.handleSaveConfigCategoria(event)">
                            <div class="form-group" style="margin-bottom: 1.2rem;">
                                <label for="conf-cat-nome">Nome da Categoria</label>
                                <input type="text" id="conf-cat-nome" class="glass-input" required placeholder="Ex: Supermercado">
                            </div>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.2rem;">
                                <div class="form-group">
                                    <label for="conf-cat-tipo">Tipo</label>
                                    <select id="conf-cat-tipo" class="glass-select">
                                        <option value="DESPESA">Despesa</option>
                                        <option value="RECEITA">Receita</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="conf-cat-icone">Ícone (Lucide)</label>
                                    <select id="conf-cat-icone" class="glass-select">
                                        <option value="coffee">☕ Café / Alimentação</option>
                                        <option value="car">🚗 Carro / Transporte</option>
                                        <option value="home">🏠 Casa / Moradia</option>
                                        <option value="smile">😊 Lazer / Diversão</option>
                                        <option value="heart">❤️ Saúde / Bem Estar</option>
                                        <option value="book-open">📖 Educação / Cursos</option>
                                        <option value="tv">📺 TV / Assinaturas</option>
                                        <option value="shopping-cart">🛒 Supermercado / Feira</option>
                                        <option value="shopping-bag">🛍️ Compras</option>
                                        <option value="droplet">💧 Água</option>
                                        <option value="zap">⚡ Luz / Energia</option>
                                        <option value="flame">🔥 Gás / Chama</option>
                                        <option value="phone">📞 Telefone</option>
                                        <option value="wifi">🌐 Internet / Wi-Fi</option>
                                        <option value="wallet">💵 Carteira / Dinheiro</option>
                                        <option value="briefcase">💼 Maleta / Trabalho</option>
                                        <option value="trending-up">📈 Gráfico / Investimentos</option>
                                        <option value="tag">🏷️ Etiqueta / Outros</option>
                                    </select>
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">
                                <i data-lucide="plus-circle" style="width: 16px; height: 16px; margin-right: 0.5rem; vertical-align: middle;"></i>
                                <span>Cadastrar Categoria</span>
                            </button>
                        </form>
                    </div>

                    <!-- Coluna Direita: Categorias Existentes -->
                    <div class="glass glass-card" style="padding: 1.8rem;">
                        <h3 style="margin-bottom: 1.5rem; font-weight: 600; font-size: 1.1rem;">Categorias Cadastradas</h3>
                        <div class="table-responsive" style="max-height: 480px; overflow-y: auto;">
                            <table class="glass-table" style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr>
                                        <th style="width: 60px; text-align: center;">Ícone</th>
                                        <th>Nome</th>
                                        <th>Tipo</th>
                                        <th style="width: 80px; text-align: center;">Ações</th>
                                    </tr>
                                </thead>
                                <tbody id="config-lista-categorias">
                                    ${this.state.categories.length === 0 ? '<tr><td colspan="4" class="text-gray" style="text-align: center; padding: 1.5rem;">Nenhuma categoria cadastrada.</td></tr>' : ''}
                                    ${this.state.categories.map(cat => `
                                        <tr>
                                            <td style="text-align: center; vertical-align: middle;">
                                                <i data-lucide="${cat.icone || 'tag'}" style="width: 16px; height: 16px;"></i>
                                            </td>
                                            <td style="font-weight: 600; vertical-align: middle;">${cat.nome}</td>
                                            <td style="vertical-align: middle;">
                                                <span class="badge ${cat.tipo === 'RECEITA' ? 'badge-receita' : 'badge-despesa'}" style="font-size: 0.65rem; padding: 0.2rem 0.4rem;">${cat.tipo}</span>
                                            </td>
                                            <td style="text-align: center; vertical-align: middle;">
                                                <button class="btn-icon" onclick="app.handleDeleteConfigCategoria(${cat.id})" title="Excluir Categoria" style="color: #ff4444; padding: 0.2rem;">
                                                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } else if (activeTab === 'parametros') {
            tabContent = `
                <div class="glass glass-card" style="padding: 2.2rem; max-width: 550px; margin: 0 auto;">
                    <h3 style="margin-bottom: 1rem; font-weight: 600; font-size: 1.15rem;">Parâmetros de Vencimento</h3>
                    <p class="text-gray" style="font-size: 0.85rem; margin-bottom: 1.8rem; line-height: 1.4;">
                        Configure o dia do mês limite que dividirá seus vencimentos nos filtros rápidos (ex: "Até o dia X" e "A partir do dia X+1") na visualização de Transações e Faturas.
                    </p>
                    <form id="form-config-parametros" onsubmit="app.handleSaveConfigParametros(event)">
                        <div class="form-group" style="margin-bottom: 1.8rem;">
                            <label for="conf-dia-corte" style="font-weight: 600; margin-bottom: 0.4rem;">Dia Limite da Primeira Quinzena</label>
                            <input type="number" id="conf-dia-corte" class="glass-input" required min="1" max="28" value="${this.state.dia_corte}" placeholder="Ex: 14">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">
                            <i data-lucide="save" style="width: 16px; height: 16px; margin-right: 0.5rem; vertical-align: middle;"></i>
                            <span>Salvar Parâmetros</span>
                        </button>
                    </form>
                </div>
            `;
        } else if (activeTab === 'sistema') {
            tabContent = `
                <div class="glass glass-card" style="padding: 2.2rem; max-width: 600px; margin: 0 auto;">
                    <h3 style="margin-bottom: 0.6rem; font-weight: 600; font-size: 1.15rem; color: #ff4444;">Área de Segurança & Sistema</h3>
                    <p class="text-gray" style="font-size: 0.85rem; margin-bottom: 2rem; line-height: 1.4;">
                        Gerencie backups do banco de dados ou realize operações de limpeza estrutural para reiniciar o sistema do zero.
                    </p>
                    
                    <div style="display: flex; flex-direction: column; gap: 1.8rem;">
                        <!-- Bloco Backup -->
                        <div style="padding: 1.4rem; border: 1px solid var(--glass-border); border-radius: 12px; background: rgba(255,255,255,0.01);">
                            <h4 style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.5rem;">
                                <i data-lucide="database" style="width: 18px; height: 18px; color: var(--primary-color);"></i>
                                <span>Criar Cópia de Segurança (Backup)</span>
                            </h4>
                            <p class="text-gray" style="font-size: 0.8rem; margin-bottom: 1.2rem; line-height: 1.4;">
                                Gera uma cópia física idêntica do banco de dados atual no diretório raiz do projeto com carimbo de data e hora no nome do arquivo.
                            </p>
                            <button class="btn btn-secondary" onclick="app.handleSistemaBackup()" style="width: 100%;">
                                <i data-lucide="download" style="width: 16px; height: 16px; margin-right: 0.5rem; vertical-align: middle;"></i>
                                Criar Backup
                            </button>
                        </div>
                        
                        <!-- Bloco Excluir Tudo -->
                        <div style="padding: 1.4rem; border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: 12px; background: rgba(239, 68, 68, 0.02);">
                            <h4 style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.4rem; color: #ef4444; display: flex; align-items: center; gap: 0.5rem;">
                                <i data-lucide="alert-triangle" style="width: 18px; height: 18px;"></i>
                                <span>Excluir Tudo & Resetar Banco</span>
                            </h4>
                            <p class="text-gray" style="font-size: 0.8rem; margin-bottom: 1.2rem; line-height: 1.4;">
                                <strong style="color: #ef4444;">Aviso Crítico:</strong> Isto apagará permanentemente todas as contas, cartões, transações cadastrados e resetará o sistema de volta ao estado inicial vazio de exemplo.
                            </p>
                            <button class="btn" onclick="app.handleSistemaExcluirTudo()" style="width: 100%; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25);">
                                <i data-lucide="trash" style="width: 16px; height: 16px; margin-right: 0.5rem; vertical-align: middle;"></i>
                                Resetar Sistema Completo
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        viewPanel.innerHTML = `
            <div class="settings-tabs-container">
                <!-- Abas de Navegação -->
                <div class="settings-tabs-nav">
                    <button class="settings-tab-btn ${activeTab === 'categorias' ? 'active' : ''}" onclick="app.setSettingsTab('categorias')">Categorias</button>
                    <button class="settings-tab-btn ${activeTab === 'parametros' ? 'active' : ''}" onclick="app.setSettingsTab('parametros')">Parâmetros</button>
                    <button class="settings-tab-btn ${activeTab === 'sistema' ? 'active' : ''}" onclick="app.setSettingsTab('sistema')">Sistema</button>
                </div>
                
                <!-- Conteúdo Renderizado da Aba Ativa -->
                <div id="settings-tab-content" style="margin-top: 1rem;">
                    ${tabContent}
                </div>
            </div>
        `;
    }

    setSettingsTab(tab) {
        this.state.activeSettingsTab = tab;
        this.renderConfiguracoes();
        lucide.createIcons();
    }

    async handleSaveConfigParametros(e) {
        e.preventDefault();
        const diaCorte = parseInt(document.getElementById('conf-dia-corte').value);
        if (isNaN(diaCorte) || diaCorte < 1 || diaCorte > 28) {
            alert("O dia de corte deve estar entre 1 e 28.");
            return;
        }

        try {
            const res = await fetch('/api/configuracoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dia_corte: diaCorte })
            });

            if (!res.ok) throw new Error("Erro ao salvar parâmetros");
            
            // Recarrega as configurações atualizadas
            await this.loadBaseData();
            this.showAlert("Parâmetros de vencimento atualizados!");
            this.renderConfiguracoes();
            lucide.createIcons();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSistemaBackup() {
        try {
            const res = await fetch('/api/sistema/backup', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erro ao realizar backup");

            this.showAlert(`Backup criado com sucesso: ${data.filename}`);
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSistemaExcluirTudo() {
        const confirm1 = confirm("ATENÇÃO! Esta ação apagará permanentemente todos os dados financeiros. Deseja continuar?");
        if (!confirm1) return;

        const confirm2 = confirm("CONFIRMAÇÃO FINAL: Tem certeza absoluta? Não há como reverter após o reset.");
        if (!confirm2) return;

        try {
            const res = await fetch('/api/sistema/excluir-tudo', { method: 'POST' });
            if (!res.ok) throw new Error("Erro ao resetar o sistema");

            this.showAlert("Banco de dados resetado com sucesso!");
            // Recarrega do zero e redireciona ao dashboard
            await this.loadBaseData();
            window.location.hash = '#/dashboard';
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSaveOrcamento(e) {
        e.preventDefault();
        const categoria_id = parseInt(document.getElementById('orc-categoria').value);
        const limite_mensal = parseFloat(document.getElementById('orc-limite').value) || 0.0;
        const mes = document.getElementById('orc-mes').value;

        try {
            const res = await fetch('/api/orcamentos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoria_id, limite_mensal, mes })
            });

            if (!res.ok) throw new Error('Erro ao salvar orçamento');

            this.closeModal('modal-categoria-orcamento');
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSaveMeta(e) {
        e.preventDefault();
        const nome = document.getElementById('meta-nome').value;
        const valor_alvo = parseFloat(document.getElementById('meta-alvo').value) || 0.0;
        const data_limite = document.getElementById('meta-data').value || null;
        const pessoa = document.getElementById('meta-pessoa').value;

        try {
            const res = await fetch('/api/metas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, valor_alvo, data_limite, pessoa })
            });

            if (!res.ok) throw new Error('Erro ao criar meta');

            this.closeModal('modal-meta');
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSavePagarFatura(e) {
        e.preventDefault();
        const cardId = document.getElementById('fatura-cartao-id').value;
        const valor_pagamento = parseFloat(document.getElementById('fatura-valor').value);
        const conta_pagamento_id = document.getElementById('fatura-conta').value;
        const mes_fatura = document.getElementById('fatura-mes').value;

        try {
            const res = await fetch(`/api/cartoes/${cardId}/pagar-fatura`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valor_pagamento, conta_pagamento_id, mes_fatura })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao realizar pagamento de fatura');
            }

            this.closeModal('modal-pagar-fatura');
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSaveTransferencia(e) {
        e.preventDefault();
        const conta_origem_id = parseInt(document.getElementById('transf-origem').value);
        const conta_destino_id = parseInt(document.getElementById('transf-destino').value);
        const valor = parseFloat(document.getElementById('transf-valor').value);
        const data = document.getElementById('transf-data').value;
        const descricao = document.getElementById('transf-descricao').value || 'Transferência entre contas';
        const pessoa = document.getElementById('transf-pessoa').value;

        if (conta_origem_id === conta_destino_id) {
            alert('A conta de origem e a conta de destino não podem ser as mesmas.');
            return;
        }

        const payload = {
            tipo: 'TRANSFERENCIA',
            descricao,
            valor,
            data,
            conta_origem_id,
            conta_destino_id,
            pago_ou_confirmado: true,
            pessoa
        };

        try {
            const res = await fetch('/api/transacoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao realizar transferência');
            }

            this.closeModal('modal-transferencia');
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleSaveMetaOperacao(e) {
        e.preventDefault();
        const metaId = document.getElementById('meta-op-id').value;
        const valor = parseFloat(document.getElementById('meta-op-valor').value);
        const conta_id = document.getElementById('meta-op-conta').value;
        const tipo_operacao = document.getElementById('meta-op-tipo').value;

        try {
            const res = await fetch(`/api/metas/${metaId}/poupar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valor, conta_id, tipo_operacao })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao processar saldo da meta');
            }

            this.closeModal('modal-meta-operacao');
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    // Alternar Conciliação (Pendente / Conciliado)
    async toggleConfirmacao(id) {
        try {
            const res = await fetch(`/api/transacoes/${id}/confirmar`, {
                method: 'PUT'
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao conciliar transação');
            }

            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    // Excluir Lançamentos
    async handleDeleteTransacao(id, isParcelado) {
        let apagarGrupo = false;
        
        if (isParcelado) {
            const escolha = await this.showConfirm(
                "Esta é uma despesa pertencente a um grupo parcelado. Como deseja proceder com a exclusão?",
                "Excluir Despesa Parcelada",
                {
                    confirmText: "Excluir Todo o Grupo",
                    cancelText: "Desistir",
                    showThird: true,
                    thirdText: "Apenas Esta Parcela"
                }
            );
            
            if (escolha === 'cancel') {
                return;
            }
            apagarGrupo = (escolha === 'confirm');
        } else {
            const escolha = await this.showConfirm("Tem certeza que deseja excluir esta transação?", "Excluir Transação");
            if (escolha !== 'confirm') return;
        }

        try {
            const res = await fetch(`/api/transacoes/${id}?apagar_grupo=${apagarGrupo}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Erro ao excluir transação');

            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    async handleEstornoFatura(pagamentoId) {
        const pagamento = (this.state.billPayments || []).find(p => p.id === pagamentoId);
        if (!pagamento) return;
        
        const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
        const [y, m] = (pagamento.fatura_mes || '').split('-');
        const mesFormatted = pagamento.fatura_mes ? `${m}/${y}` : '';
        
        const confirmacao = await this.showConfirm(
            `Deseja realmente ESTORNAR o pagamento da fatura do cartão "${pagamento.cartao_credito_nome}" referente ao mês ${mesFormatted}?
            Isso irá devolver o valor de ${fmt(pagamento.valor)} para a conta "${pagamento.conta_origem_nome}" e a dívida do cartão voltará a ficar aberta.`,
            "Estornar Pagamento de Fatura"
        );
        
        if (confirmacao !== 'confirm') return;
        
        try {
            const res = await fetch(`/api/transacoes/${pagamentoId}/estornar-fatura`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao estornar fatura');
            }
            
            // Recarrega os dados e atualiza a view
            await this.loadBaseData();
            this.refreshCurrentView();
        } catch (err) {
            alert(err.message);
        }
    }

    // Exportação em formato CSV
    exportToCSV() {
        if (this.state.transactions.length === 0) {
            alert("Nenhuma transação disponível para exportação.");
            return;
        }

        // Cabeçalhos do CSV
        const headers = ["Data", "Tipo", "Descricao", "Categoria", "Origem_Destino", "Valor", "Pago_Confirmado"];
        
        const rows = this.state.transactions.map(t => {
            const origDest = t.tipo === 'RECEITA' ? (t.pagador_recebedor || '') : (t.cartao_credito_nome || t.conta_origem_nome || '');
            const cat = t.tipo === 'TRANSFERENCIA' ? `Transferência para ${t.conta_destino_nome}` : (t.categoria_nome || '');
            
            return [
                t.data,
                t.tipo,
                `"${t.descricao.replace(/"/g, '""')}"`,
                `"${cat}"`,
                `"${origDest}"`,
                t.valor,
                t.pago_ou_confirmado ? "SIM" : "NAO"
            ];
        });

        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
            + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `extrato_financeiro_${this.state.currentMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Inicializa a aplicação globalmente
const app = new FinanceApp();
window.app = app;
