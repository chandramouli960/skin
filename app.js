// Wait for Supabase to be initialized
let supabase;
let currentUser = null;
let userGroups = [];
let userGoals = [];

// Initialize Supabase when ready
function initSupabase() {
    if (window.supabaseClient) {
        supabase = window.supabaseClient;
        initializeApp();
    } else {
        // Wait a bit and try again
        setTimeout(initSupabase, 100);
    }
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
} else {
    initSupabase();
}

function initializeApp() {
    if (!supabase) {
        console.error('Supabase not initialized');
        return;
    }

    // Show status message
    function showStatus(message, type = 'success') {
        const statusEl = document.getElementById('statusMessage');
        statusEl.textContent = message;
        statusEl.className = `status-message ${type} show`;
        
        setTimeout(() => {
            statusEl.classList.remove('show');
    }, 3000);
    }

    // Modal management
    function openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    }

    // Close modals when clicking outside or close button
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
        if (e.target.classList.contains('modal-close')) {
            const modalId = e.target.getAttribute('data-modal');
        closeModal(modalId);
    }
    });

    // Tab navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
        switchTab(tabId);
    });
    });

    function switchTab(tabId) {
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Show selected tab
        document.getElementById(tabId).classList.add('active');
        
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        
        // Load data for the tab
        if (tabId === 'groupsTab') {
            loadGroups();
        } else if (tabId === 'goalsTab') {
            loadGoals();
        } else if (tabId === 'progressTab') {
        loadProgress();
    }
    }

    // Check authentication state
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            showMainApp(session.user);
        } else {
            currentUser = null;
            showAuthModal();
        }
    });

    // Check current session on load
    async function checkSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            currentUser = session.user;
            showMainApp(session.user);
        } else {
            showAuthModal();
        }
    }

    checkSession();

    // Show authentication modal
    function showAuthModal() {
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }

    // Show main app
    function showMainApp(user) {
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('userName').textContent = user.user_metadata?.name || user.email;
        loadGroups();
    }

    // Switch between login and register forms
    document.getElementById('showRegister')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    });

    document.getElementById('showLogin')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    });

    // Handle registration
    const registerForm = document.getElementById('registerFormElement');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const nameInput = document.getElementById('registerName');
            const emailInput = document.getElementById('registerEmail');
            const passwordInput = document.getElementById('registerPassword');
            
            if (!nameInput || !emailInput || !passwordInput) {
                showStatus('Form fields not found', 'error');
                return;
            }
            
            const name = nameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            
            // Validation
            if (!name) {
                showStatus('Please enter your name', 'error');
                return;
            }
            
            if (!email) {
                showStatus('Please enter your email', 'error');
                return;
            }
            
            if (password.length < 6) {
                showStatus('Password must be at least 6 characters', 'error');
                return;
            }
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (!submitBtn) {
                showStatus('Submit button not found', 'error');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating...';
            
            try {
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            name: name
                        }
                    }
                });
                
                if (error) {
                    throw error;
                }
                
                // Check if email confirmation is required
                if (data && data.user && !data.session) {
                    // Email confirmation required
                    showStatus('Account created! Please check your email to confirm your account.', 'success');
                    
                    // Reset form
                    registerForm.reset();
                    
                    // Switch to login form
                    document.getElementById('registerForm').style.display = 'none';
                    document.getElementById('loginForm').style.display = 'block';
                    
                    // Pre-fill email in login form
                    document.getElementById('loginEmail').value = email;
                } else if (data && data.session) {
                    // Auto-logged in (if email confirmation disabled)
                    currentUser = data.user;
                    showMainApp(data.user);
                    showStatus('Account created and logged in successfully!', 'success');
                } else {
                    // Fallback
                    showStatus('Account created successfully! You can now log in.', 'success');
                    registerForm.reset();
                    document.getElementById('registerForm').style.display = 'none';
                    document.getElementById('loginForm').style.display = 'block';
                    document.getElementById('loginEmail').value = email;
                }
                
            } catch (error) {
                console.error('Registration error:', error);
                showStatus(getErrorMessage(error.message), 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Register';
            }
        });
    }

    // Handle login
    const loginForm = document.getElementById('loginFormElement');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const emailInput = document.getElementById('loginEmail');
            const passwordInput = document.getElementById('loginPassword');
            
            if (!emailInput || !passwordInput) {
                showStatus('Form fields not found', 'error');
                return;
            }
            
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            
            // Validation
            if (!email) {
                showStatus('Please enter your email', 'error');
                emailInput.focus();
                return;
            }
            
            if (!password) {
                showStatus('Please enter your password', 'error');
                passwordInput.focus();
                return;
            }
            
            // Basic email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showStatus('Please enter a valid email address', 'error');
                emailInput.focus();
                return;
            }
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (!submitBtn) {
                showStatus('Submit button not found', 'error');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';
            
            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (error) {
                    throw error;
                }
                
                // Check if we got a session
                if (data && data.session) {
                    // Success - show main app immediately
                    currentUser = data.user;
                    showMainApp(data.user);
                    showStatus('Logged in successfully!', 'success');
                } else {
                    // Wait a moment for auth state to update
                    setTimeout(async () => {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (session) {
                            currentUser = session.user;
                            showMainApp(session.user);
                            showStatus('Logged in successfully!', 'success');
                        }
                    }, 500);
                }
                
                // Clear password field for security
                passwordInput.value = '';
                
            } catch (error) {
                console.error('Login error:', error);
                showStatus(getErrorMessage(error.message), 'error');
                
                // Clear password on error
                passwordInput.value = '';
                passwordInput.focus();
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Login';
            }
        });
    }

    // Handle logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            showStatus('Logged out successfully', 'success');
        } catch (error) {
            console.error('Logout error:', error);
        showStatus('Error logging out', 'error');
        }
    });

    // Get user-friendly error messages
    function getErrorMessage(errorMessage) {
        if (!errorMessage) return 'An error occurred. Please try again.';
        
        const errorMessages = {
            // Registration errors
            'User already registered': 'This email is already registered',
            'already registered': 'This email is already registered',
            'Invalid email': 'Invalid email address',
            'invalid email': 'Invalid email address',
            'Password should be at least 6 characters': 'Password must be at least 6 characters',
            'password': 'Password must be at least 6 characters',
            'Email not confirmed': 'Please check your email to confirm your account',
            'email not confirmed': 'Please check your email to confirm your account',
            'signup_disabled': 'Registration is currently disabled',
            'email_rate_limit': 'Too many requests. Please try again later',
            
            // Login errors
            'Invalid login credentials': 'Incorrect email or password',
            'Invalid credentials': 'Incorrect email or password',
            'invalid login': 'Incorrect email or password',
            'invalid password': 'Incorrect password',
            'Email not confirmed': 'Please check your email to confirm your account before logging in',
            'User not found': 'No account found with this email',
            'user not found': 'No account found with this email',
            'too many requests': 'Too many login attempts. Please try again later',
            'rate limit': 'Too many requests. Please wait a moment and try again',
            'network': 'Network error. Please check your connection',
            'Network request failed': 'Network error. Please check your connection'
        };
        
        const lowerMessage = errorMessage.toLowerCase();
        for (const [key, value] of Object.entries(errorMessages)) {
            if (lowerMessage.includes(key.toLowerCase())) {
                return value;
            }
        }
        
        return errorMessage;
    }

    // ========== GROUPS ==========

    // Load groups
    async function loadGroups() {
        const groupsList = document.getElementById('groupsList');
        groupsList.innerHTML = '<p class="loading">Loading groups...</p>';
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            // Get groups where user is a member
            const { data: memberships, error: memError } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', user.id);
            
            if (memError) throw memError;
            
            if (!memberships || memberships.length === 0) {
                groupsList.innerHTML = '<p class="empty-state">You haven\'t joined any groups yet. Create or join one to get started!</p>';
                return;
            }
            
            const groupIds = memberships.map(m => m.group_id);
            
            const { data: groups, error } = await supabase
                .from('groups')
                .select('*')
                .in('id', groupIds)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            userGroups = groups || [];
            displayGroups(groups || []);
        } catch (error) {
            console.error('Error loading groups:', error);
            groupsList.innerHTML = '<p class="empty-state" style="color: var(--error);">Error loading groups</p>';
        }
    }

    // Display groups
    function displayGroups(groups) {
        const groupsList = document.getElementById('groupsList');
        
        if (groups.length === 0) {
            groupsList.innerHTML = '<p class="empty-state">You haven\'t joined any groups yet. Create or join one to get started!</p>';
            return;
        }
        
        groupsList.innerHTML = groups.map(group => `
            <div class="card" onclick="viewGroup('${group.id}')">
                <div class="card-header">
                    <div>
                        <div class="card-title">${escapeHtml(group.name)}</div>
                        <div class="card-subtitle">Code: ${group.code}</div>
                    </div>
                </div>
                <div class="card-content">${escapeHtml(group.description || 'No description')}</div>
                <div class="card-footer">
                    <span>Created ${formatDate(group.created_at)}</span>
                </div>
            </div>
        `).join('');
    }

    // Create group
    document.getElementById('createGroupBtn')?.addEventListener('click', () => {
        openModal('createGroupModal');
    });

    document.getElementById('createGroupForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showStatus('Please log in', 'error');
            return;
        }
        
        const name = document.getElementById('groupName').value;
        const description = document.getElementById('groupDescription').value;
        
        // Generate unique code
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        try {
            const { data: group, error } = await supabase
                .from('groups')
                .insert([{
                    name: name,
                    description: description,
                    created_by: user.id,
                    code: code
                }])
                .select()
                .single();
            
            if (error) throw error;
            
            // Add creator as member
            await supabase
                .from('group_members')
                .insert([{
                    group_id: group.id,
                    user_id: user.id,
                    role: 'owner'
                }]);
            
            showStatus('Group created successfully! Code: ' + code, 'success');
            closeModal('createGroupModal');
            document.getElementById('createGroupForm').reset();
            loadGroups();
        } catch (error) {
            console.error('Error creating group:', error);
            showStatus('Error creating group', 'error');
        }
    });

    // Join group
    document.getElementById('joinGroupBtn')?.addEventListener('click', () => {
        openModal('joinGroupModal');
    });

    document.getElementById('joinGroupForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showStatus('Please log in', 'error');
            return;
        }
        
        const code = document.getElementById('groupCode').value.toUpperCase().trim();
        
        try {
            // Find group by code
            const { data: group, error: groupError } = await supabase
                .from('groups')
                .select('*')
                .eq('code', code)
                .single();
            
            if (groupError || !group) {
                showStatus('Invalid group code', 'error');
                return;
            }
            
            // Check if already a member
            const { data: existing } = await supabase
                .from('group_members')
                .select('*')
                .eq('group_id', group.id)
                .eq('user_id', user.id)
                .single();
            
            if (existing) {
                showStatus('You are already a member of this group', 'error');
                return;
            }
            
            // Add as member
            const { error } = await supabase
                .from('group_members')
                .insert([{
                    group_id: group.id,
                    user_id: user.id,
                    role: 'member'
                }]);
            
            if (error) throw error;
            
            showStatus('Successfully joined group!', 'success');
            closeModal('joinGroupModal');
            document.getElementById('joinGroupForm').reset();
            loadGroups();
        } catch (error) {
            console.error('Error joining group:', error);
            showStatus('Error joining group', 'error');
        }
    });

    function viewGroup(groupId) {
        // Switch to goals tab and filter by group
        switchTab('goalsTab');
        // Could add group filter here
    }

    // ========== GOALS ==========

    // Load goals
    async function loadGoals() {
        const goalsList = document.getElementById('goalsList');
        goalsList.innerHTML = '<p class="loading">Loading goals...</p>';
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            // Get user's groups
            const { data: memberships } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', user.id);
            
            const groupIds = memberships ? memberships.map(m => m.group_id) : [];
            
            // Get personal goals and group goals
            let query = supabase
                .from('goals')
                .select('*, groups(name)')
                .eq('is_active', true)
                .order('created_at', { ascending: false });
            
            if (groupIds.length > 0) {
                query = query.or(`user_id.eq.${user.id},group_id.in.(${groupIds.join(',')})`);
            } else {
                query = query.eq('user_id', user.id);
            }
            
            const { data: goals, error } = await query;
            
            if (error) throw error;
            
            userGoals = goals || [];
            displayGoals(goals || []);
            
            // Update goal group dropdown
            updateGoalGroupDropdown();
        } catch (error) {
            console.error('Error loading goals:', error);
            goalsList.innerHTML = '<p class="empty-state" style="color: var(--error);">Error loading goals</p>';
        }
    }

    // Display goals
    async function displayGoals(goals) {
        const goalsList = document.getElementById('goalsList');
        
        if (goals.length === 0) {
            goalsList.innerHTML = '<p class="empty-state">No goals yet. Create your first goal!</p>';
            return;
        }
        
        // Get progress counts for all goals
        const progressData = await Promise.all(goals.map(async goal => {
            const { count } = await supabase
                .from('progress_entries')
                .select('*', { count: 'exact', head: true })
                .eq('goal_id', goal.id);
            return { goalId: goal.id, count: count || 0 };
        }));
        
        goalsList.innerHTML = goals.map(goal => {
            const progressInfo = progressData.find(p => p.goalId === goal.id);
            const progressCount = progressInfo ? progressInfo.count : 0;
            const progressPercent = goal.target_days ? Math.min((progressCount / goal.target_days) * 100, 100) : 0;
            
            const groupName = goal.groups ? ` • ${escapeHtml(goal.groups.name)}` : '';
            
            return `
                <div class="card" onclick="viewGoalDetails('${goal.id}')">
                    <div class="card-header">
                        <div>
                            <div class="card-title">${escapeHtml(goal.title)}${groupName}</div>
                            <div class="card-subtitle">${goal.frequency} • ${progressCount}/${goal.target_days} days</div>
                        </div>
                    </div>
                    <div class="card-content">${escapeHtml(goal.description || 'No description')}</div>
                    <div class="goal-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progressPercent}%"></div>
                        </div>
                        <div class="progress-text">${Math.round(progressPercent)}% complete</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Update goal group dropdown
    async function updateGoalGroupDropdown() {
        const select = document.getElementById('goalGroup');
        if (!select) return;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        // Get user's groups
        const { data: memberships } = await supabase
            .from('group_members')
            .select('group_id, groups(name)')
            .eq('user_id', user.id);
        
        select.innerHTML = '<option value="">Personal Goal</option>';
        
        if (memberships) {
            memberships.forEach(m => {
                const option = document.createElement('option');
                option.value = m.group_id;
                option.textContent = m.groups.name;
                select.appendChild(option);
            });
        }
    }

    // Create goal
    document.getElementById('createGoalBtn')?.addEventListener('click', () => {
        updateGoalGroupDropdown();
        openModal('createGoalModal');
    });

    document.getElementById('createGoalForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showStatus('Please log in', 'error');
            return;
        }
        
        const title = document.getElementById('goalTitle').value;
        const description = document.getElementById('goalDescription').value;
        const groupId = document.getElementById('goalGroup').value || null;
        const frequency = document.getElementById('goalFrequency').value;
        const targetDays = parseInt(document.getElementById('goalTargetDays').value) || 30;
        
        try {
            const { error } = await supabase
                .from('goals')
                .insert([{
                    user_id: user.id,
                    group_id: groupId,
                    title: title,
                    description: description,
                    frequency: frequency,
                    target_days: targetDays,
                    is_active: true
                }]);
            
            if (error) throw error;
            
            showStatus('Goal created successfully!', 'success');
            closeModal('createGoalModal');
            document.getElementById('createGoalForm').reset();
            loadGoals();
        } catch (error) {
            console.error('Error creating goal:', error);
            showStatus('Error creating goal', 'error');
        }
    });

    // View goal details
    async function viewGoalDetails(goalId) {
        const goal = userGoals.find(g => g.id === goalId);
        if (!goal) return;
        
        document.getElementById('goalDetailsTitle').textContent = goal.title;
        
        // Get progress entries
        const { data: entries } = await supabase
            .from('progress_entries')
            .select('*')
            .eq('goal_id', goalId)
            .order('date', { ascending: false });
        
        // Get user info for entries - we'll use a simpler approach
        const entriesWithUsers = (entries || []).map(entry => {
            // For now, just use user_id - we'll enhance this later
            return { ...entry, userName: 'User' };
        });
        
        // Get comments for each entry
        const entriesWithComments = await Promise.all(entriesWithUsers.map(async entry => {
            const { data: comments } = await supabase
                .from('comments')
                .select('*')
                .eq('progress_id', entry.id)
                .order('created_at', { ascending: true });
            
            // Get user info for comments
            const commentsWithUsers = (comments || []).map(comment => {
                return { ...comment, userName: 'User' };
            });
            
            return { ...entry, comments: commentsWithUsers };
        }));
        
        const content = `
            <div style="padding: 20px;">
                <p style="color: var(--text-light); margin-bottom: 20px;">${escapeHtml(goal.description || 'No description')}</p>
                
                <div class="section-header" style="margin-top: 30px;">
                    <h3>Progress Entries</h3>
                    <button class="btn btn-primary btn-small" onclick="openLogProgress('${goalId}')">+ Log Progress</button>
                </div>
                
                <div class="progress-entries-list" style="margin-top: 20px;">
                    ${entriesWithComments.length === 0 ? '<p class="empty-state">No progress logged yet</p>' : 
                    entriesWithComments.map(entry => `
                        <div class="progress-entry">
                            <div class="progress-entry-header">
                                <div>
                                    <div class="progress-user">${escapeHtml(entry.userName)}</div>
                                    <div class="progress-date">${formatDate(entry.date)}</div>
                                </div>
                            </div>
                            ${entry.notes ? `<div class="progress-notes">${escapeHtml(entry.notes)}</div>` : ''}
                            
                            <div class="comments-section">
                                <div class="comments-list">
                                    ${entry.comments.map(comment => `
                                        <div class="comment">
                                            <div class="comment-header">
                                                <span class="comment-user">${escapeHtml(comment.userName)}</span>
                                                <span class="comment-date">${formatDate(comment.created_at)}</span>
                                            </div>
                                            <div class="comment-content">${escapeHtml(comment.content)}</div>
                                        </div>
                                    `).join('')}
                                </div>
                                <div class="add-comment">
                                    <input type="text" placeholder="Add a comment..." id="comment-${entry.id}">
                                    <button class="btn btn-primary btn-small" onclick="addComment('${entry.id}')">Post</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        document.getElementById('goalDetailsContent').innerHTML = content;
        openModal('goalDetailsModal');
    }

    // Make functions global for onclick handlers
    window.viewGroup = viewGroup;
    window.viewGoalDetails = viewGoalDetails;
    window.openLogProgress = (goalId) => {
        document.getElementById('progressGoalId').value = goalId;
        document.getElementById('progressDate').valueAsDate = new Date();
        closeModal('goalDetailsModal');
        openModal('logProgressModal');
    };
    window.addComment = async (progressId) => {
        const input = document.getElementById(`comment-${progressId}`);
        const content = input.value.trim();
        if (!content) return;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        try {
            const { error } = await supabase
                .from('comments')
                .insert([{
                    progress_id: progressId,
                    user_id: user.id,
                    content: content
                }]);
            
            if (error) throw error;
            
            input.value = '';
            // Reload goal details
            const goalId = document.getElementById('progressGoalId').value || 
                          document.querySelector('.progress-entry')?.closest('.goal-details')?.dataset.goalId;
            if (goalId) {
                viewGoalDetails(goalId);
            }
        } catch (error) {
            console.error('Error adding comment:', error);
            showStatus('Error adding comment', 'error');
        }
    };

    // Log progress
    document.getElementById('logProgressForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showStatus('Please log in', 'error');
            return;
        }
        
        const goalId = document.getElementById('progressGoalId').value;
        const date = document.getElementById('progressDate').value;
        const notes = document.getElementById('progressNotes').value;
        
        try {
            const { error } = await supabase
                .from('progress_entries')
                .insert([{
                    goal_id: goalId,
                    user_id: user.id,
                    date: date,
                    notes: notes
                }]);
            
            if (error) throw error;
            
            showStatus('Progress logged successfully!', 'success');
            closeModal('logProgressModal');
            document.getElementById('logProgressForm').reset();
            loadGoals();
            loadProgress();
        } catch (error) {
            console.error('Error logging progress:', error);
            showStatus('Error logging progress', 'error');
        }
    });

    // ========== PROGRESS ==========

    // Load progress
    async function loadProgress() {
        const progressList = document.getElementById('progressList');
        progressList.innerHTML = '<p class="loading">Loading progress...</p>';
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            // Get user's groups
            const { data: memberships } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', user.id);
            
            const groupIds = memberships ? memberships.map(m => m.group_id) : [];
            
            // Get goals user can see
            let goalsQuery = supabase
                .from('goals')
                .select('id');
            
            if (groupIds.length > 0) {
                goalsQuery = goalsQuery.or(`user_id.eq.${user.id},group_id.in.(${groupIds.join(',')})`);
            } else {
                goalsQuery = goalsQuery.eq('user_id', user.id);
            }
            
            const { data: goals } = await goalsQuery;
            
            const goalIds = goals ? goals.map(g => g.id) : [];
            
            if (goalIds.length === 0) {
                progressList.innerHTML = '<p class="empty-state">No progress entries yet</p>';
                return;
            }
            
            // Get recent progress entries
            const { data: entries } = await supabase
                .from('progress_entries')
                .select('*, goals(title)')
                .in('goal_id', goalIds)
                .order('date', { ascending: false })
                .limit(20);
            
            // Get user info for entries
            const entriesWithUsers = (entries || []).map(entry => {
                return { ...entry, userName: 'User' };
            });
            
            displayProgress(entriesWithUsers);
        } catch (error) {
            console.error('Error loading progress:', error);
            progressList.innerHTML = '<p class="empty-state" style="color: var(--error);">Error loading progress</p>';
        }
    }

    // Display progress
    function displayProgress(entries) {
        const progressList = document.getElementById('progressList');
        
        if (entries.length === 0) {
            progressList.innerHTML = '<p class="empty-state">No progress entries yet</p>';
            return;
        }
        
        progressList.innerHTML = entries.map(entry => `
            <div class="card" onclick="viewGoalDetails('${entry.goal_id}')">
                <div class="card-header">
                    <div>
                        <div class="card-title">${escapeHtml(entry.goals?.title || 'Unknown Goal')}</div>
                        <div class="card-subtitle">${escapeHtml(entry.userName)} • ${formatDate(entry.date)}</div>
                    </div>
                </div>
                ${entry.notes ? `<div class="card-content">${escapeHtml(entry.notes)}</div>` : ''}
            </div>
        `).join('');
    }

    // Utility functions
    function formatDate(dateString) {
        if (!dateString) return 'No date';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize date inputs
    const progressDate = document.getElementById('progressDate');
    if (progressDate) {
        progressDate.valueAsDate = new Date();
    }
}
