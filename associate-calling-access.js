/* Calling access lives on the selected associate overview. */
(() => {
  let generation = 0;
  window.addEventListener('steadyhands:associate-open', async event => {
    const request = ++generation;
    const {userId} = event.detail;
    const drawer = document.getElementById('adminUserDrawer');
    const panel = document.createElement('section');
    panel.className = 'admin-user-field';
    panel.innerHTML = '<h3>Calling access</h3><p role="status">Checking calling access…</p><button type="button" disabled>Block from Calling</button><p>Blocking also removes access to leads. An admin can restore access here.</p>';
    drawer.querySelector('.admin-user-quick-links').before(panel);
    const status = panel.querySelector('[role=status]');
    const button = panel.querySelector('button');
    const client = window.steadyHandsCRMClient;
    const current = () => request === generation && panel.isConnected && drawer.dataset.userId === userId;
    let policy;
    function render() {
      const blocked = policy?.mode === 'restricted';
      status.textContent = blocked ? 'Blocked from calling · Leads hidden' : 'Calling allowed · ' + (policy?.mode === 'delayed' ? 'Preparation delay enabled' : 'Normal calling');
      button.textContent = blocked ? 'Unblock Calling' : 'Block from Calling';
      button.setAttribute('aria-pressed', String(blocked));
      button.disabled = false;
    }
    try {
      const result = await client.from('associate_calling_policies').select('mode,delay_min,delay_max,slow_bias').eq('user_id', userId).maybeSingle();
      if (!current()) return;
      if (result.error) throw result.error;
      policy = result.data;
      render();
    } catch (error) {
      if (current()) status.textContent = 'Could not check calling access: ' + (error.message || error);
      return;
    }
    button.onclick = async () => {
      const blocked = policy?.mode === 'restricted';
      button.disabled = true;
      status.textContent = 'Saving…';
      try {
        const mode = blocked ? 'normal' : 'restricted';
        const {error} = await client.rpc('admin_set_calling_policy', {
          p_user_id: userId, p_mode: mode,
          p_min: policy?.delay_min ?? 7, p_max: policy?.delay_max ?? 45,
          p_bias: policy?.slow_bias || 'high'
        });
        if (error) throw error;
        if (!current()) return;
        policy = {...policy, mode};
        render();
      } catch (error) {
        if (current()) {
          status.textContent = 'Could not save calling access: ' + (error.message || error);
          button.disabled = false;
        }
      }
    };
  });
})();
