/* ==========================================================================
   BillNova India: Product Photo Picker
   Wires the custom (non-native-looking) photo upload control used in the
   New Product / Add Product / Edit Item modals: a tappable preview thumbnail
   plus Add/Change/Remove buttons, backed by a hidden <input type="file">.
   Images are downscaled + compressed via Utils.resizeImageFile before being
   handed back, so stored product photos stay small.
   ========================================================================== */

const PhotoPicker = (() => {
  /**
   * Wires up a photo picker for a given id prefix. Expects these elements
   * to exist in the DOM: `${prefix}-photo-input`, `${prefix}-photo-preview`,
   * `${prefix}-photo-btn`, `${prefix}-photo-remove`.
   * @param {string} prefix
   * @returns {{getPhoto: Function, setPhoto: Function, reset: Function}|null}
   */
  function create(prefix) {
    const input = document.getElementById(`${prefix}-photo-input`);
    const preview = document.getElementById(`${prefix}-photo-preview`);
    const addBtn = document.getElementById(`${prefix}-photo-btn`);
    const removeBtn = document.getElementById(`${prefix}-photo-remove`);

    if (!input || !preview || !addBtn || !removeBtn) return null;

    let currentPhoto = null;

    function render() {
      if (currentPhoto) {
        preview.innerHTML = `<img src="${currentPhoto}" alt="Product photo">`;
        preview.classList.add('has-photo');
        removeBtn.hidden = false;
        addBtn.innerHTML = '<i class="fa-solid fa-camera" aria-hidden="true"></i> Change Photo';
      } else {
        preview.innerHTML = '<i class="fa-solid fa-image" aria-hidden="true"></i>';
        preview.classList.remove('has-photo');
        removeBtn.hidden = true;
        addBtn.innerHTML = '<i class="fa-solid fa-camera" aria-hidden="true"></i> Add Photo';
      }
    }

    function openPicker() {
      input.click();
    }

    addBtn.addEventListener('click', openPicker);
    preview.addEventListener('click', openPicker);
    preview.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPicker();
      }
    });

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        Toast.error('Please choose an image file.');
        input.value = '';
        return;
      }

      try {
        currentPhoto = await Utils.resizeImageFile(file, 480, 0.75);
        render();
      } catch (err) {
        console.error('[PhotoPicker] Failed to load photo', err);
        Toast.error('Could not load that image. Try a different photo.');
      } finally {
        input.value = '';
      }
    });

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentPhoto = null;
      render();
    });

    render();

    return {
      getPhoto: () => currentPhoto,
      setPhoto: (photo) => {
        currentPhoto = photo || null;
        render();
      },
      reset: () => {
        currentPhoto = null;
        render();
      },
    };
  }

  return { create };
})();
