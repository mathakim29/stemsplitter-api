import EditorJS from 'https://esm.sh/@editorjs/editorjs@2.29.1';
import Header from 'https://esm.sh/@editorjs/header@2.8.1';

class UserBox {
    static get toolbox() {
        return { title: 'Text', icon: '📝' };
    }

    constructor({ data, api, block }) {
        this.data = data || { text: '' };
        this.api = api;
        this.block = block;
    }

    render() {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="comment-box">
                <textarea placeholder="Type here..."></textarea>
                <div style="display:flex;justify-content:flex-end">
                <button type="button">Submit</button>
                </div>
            </div>
        `;

        const textarea = wrapper.querySelector('textarea');
        const button = wrapper.querySelector('button');

        button.addEventListener('click', async () => {
            
                try {
                    const res = await fetch('/export', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: textarea.value })
                    });
            
                    if (!res.ok) throw new Error('Request failed');
                    const result = await res.json();

                    /* replace block */
                    const index = this.api.blocks.getBlockIndex(this.block.id);
                    this.api.blocks.delete(index);
                    this.api.blocks.insert('paragraph', { text: JSON.stringify(result) }, {}, index);

                    console.log('Server response:', result);
                    alert('Saved successfully!');

                } catch (err) {
                    console.error(err);
                    alert('Save failed');
                }
            
        });

        this.wrapper = wrapper;
        return wrapper;
    }

    save(blockContent) {
        return { text: blockContent.querySelector('textarea').value };
    }
}

const editor = new EditorJS({
    holder: 'editorjs',
    placeholder: 'Start typing...',

    tools: {
        header: Header,
        userbox: UserBox
    },

    defaultBlock: 'userbox',

    data: {
    }
});