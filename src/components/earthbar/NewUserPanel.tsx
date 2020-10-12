import React from 'react';
import { NewKeypairForm, AuthorKeypairUpload } from '../../index';
import { useDownloadAuthorKeypair } from '../../util';

export default function NewUserPanel() {
  const download = useDownloadAuthorKeypair();

  return (
    <div>
      <section data-react-earthstar-new-user-panel-make-section>
        <h1 data-react-earthstar-new-user-panel-make-section-title>
          {'Make a new identity'}
        </h1>
        <NewKeypairForm onSuccess={download} />
        <p data-react-earthstar-new-user-panel-make-section-note>
          {
            'A new, unique identity will be created for you. A keypair.json file which you can use to prove your identity will be generated and downloaded to your device.'
          }
        </p>
        <p data-react-earthstar-new-user-panel-make-section-note>
          {
            'Keep this file somewhere safe, like a password manager! If you lose it, you can’t log in and it can’t be recovered.'
          }
        </p>
      </section>
      <hr />
      <section data-react-earthstar-new-user-panel-login-section>
        <h1 data-react-earthstar-new-user-panel-login-section-title>
          {'Log in'}
        </h1>
        <AuthorKeypairUpload />
      </section>
    </div>
  );
}
