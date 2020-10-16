import React from 'react';
import {
  AuthorKeypair,
  IStorage,
  StorageMemory,
  ValidatorEs4,
  syncLocalAndHttp,
  QueryOpts,
  DocToSet,
  Document,
  isErr,
  EarthstarError,
  WriteResult,
  ValidationError,
  WriteEvent,
  OnePubOneWorkspaceSyncer,
} from 'earthstar';

const StorageContext = React.createContext<{
  storages: Record<string, IStorage>; // workspace address --> IStorage instance
  setStorages: React.Dispatch<React.SetStateAction<Record<string, IStorage>>>;
}>({ storages: {}, setStorages: () => {} });

const PubsContext = React.createContext<{
  pubs: Record<string, string[]>; // workspace address --> pub urls
  setPubs: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}>({ pubs: {}, setPubs: () => {} });

const CurrentAuthorContext = React.createContext<{
  currentAuthor: AuthorKeypair | null;
  setCurrentAuthor: React.Dispatch<React.SetStateAction<AuthorKeypair | null>>;
}>({ currentAuthor: null, setCurrentAuthor: () => {} });

const IsLiveContext = React.createContext<{
  isLive: boolean;
  setIsLive: React.Dispatch<React.SetStateAction<boolean>>;
}>({
  isLive: false,
  setIsLive: () => {},
});

export function EarthstarPeer({
  initWorkspaces = [],
  initPubs = {},
  initCurrentAuthor = null,
  initIsLive = false,
  children,
}: {
  initWorkspaces?: IStorage[];
  initPubs?: Record<string, string[]>;
  initCurrentAuthor?: AuthorKeypair | null;
  initIsLive?: boolean;
  children: React.ReactNode;
}) {
  const [storages, setStorages] = React.useState(
    initWorkspaces.reduce<Record<string, IStorage>>((acc, storage) => {
      return { ...acc, [storage.workspace]: storage };
    }, {})
  );

  const [pubs, setPubs] = React.useState(initPubs);

  const [currentAuthor, setCurrentAuthor] = React.useState(initCurrentAuthor);

  const [isLive, setIsLive] = React.useState(initIsLive);

  return (
    <StorageContext.Provider value={{ storages, setStorages }}>
      <PubsContext.Provider value={{ pubs, setPubs }}>
        <CurrentAuthorContext.Provider
          value={{ currentAuthor, setCurrentAuthor }}
        >
          <IsLiveContext.Provider value={{ isLive, setIsLive }}>
            {children}
            {Object.keys(storages).map(workspaceAddress => (
              <LiveSyncer
                key={workspaceAddress}
                workspaceAddress={workspaceAddress}
              />
            ))}
          </IsLiveContext.Provider>
        </CurrentAuthorContext.Provider>
      </PubsContext.Provider>
    </StorageContext.Provider>
  );
}

function LiveSyncer({ workspaceAddress }: { workspaceAddress: string }) {
  const [isLive] = useIsLive();
  const [storages] = useStorages();
  const [pubs] = useWorkspacePubs(workspaceAddress);

  React.useEffect(() => {
    const syncers = pubs.map(
      pubUrl => new OnePubOneWorkspaceSyncer(storages[workspaceAddress], pubUrl)
    );

    if (!isLive) {
      syncers.forEach(syncer => {
        syncer.stopPushStream();
        syncer.stopPullStream();
      });
    } else {
      // Start streaming when isLive changes to true
      syncers.forEach(syncer => {
        syncer.syncOnceAndContinueLive();
      });
    }

    // On cleanup (unmount, value of syncers changes) stop all syncers from pulling and pushing
    return () => {
      syncers.forEach(syncer => {
        syncer.stopPullStream();
        syncer.stopPushStream();
      });
    };
  }, [pubs, isLive, workspaceAddress, storages]);

  return null;
}

export function useWorkspaces() {
  const [storages] = useStorages();

  return Object.keys(storages);
}

export function useAddWorkspace() {
  const [storages, setStorages] = useStorages();

  return React.useCallback(
    (address: string) => {
      if (storages[address]) {
        return void 0;
      }

      try {
        const newStorage = new StorageMemory([ValidatorEs4], address);

        setStorages(prev => ({
          ...prev,
          [address]: newStorage,
        }));

        return void 0;
      } catch (err) {
        if (isErr(err)) {
          return err;
        }

        return new EarthstarError('Something went wrong!');
      }
    },
    [setStorages, storages]
  );
}

export function useRemoveWorkspace() {
  const [, setStorages] = useStorages();

  return React.useCallback(
    (address: string) => {
      setStorages(prev => {
        const prevCopy = { ...prev };

        delete prevCopy[address];

        return prevCopy;
      });
    },
    [setStorages]
  );
}

export function useWorkspacePubs(
  workspaceAddress: string
): [string[], (pubs: React.SetStateAction<string[]>) => void] {
  const [existingPubs, setPubs] = usePubs();

  const workspacePubs = existingPubs[workspaceAddress] || [];
  const setWorkspacePubs = React.useCallback(
    (pubs: React.SetStateAction<string[]>) => {
      setPubs(({ [workspaceAddress]: prevWorkspacePubs, ...rest }) => {
        if (Array.isArray(pubs)) {
          return { ...rest, [workspaceAddress]: Array.from(new Set(pubs)) };
        }
        const next = pubs(prevWorkspacePubs || []);
        return { ...rest, [workspaceAddress]: Array.from(new Set(next)) };
      });
    },
    [setPubs, workspaceAddress]
  );

  return [workspacePubs, setWorkspacePubs];
}

export function usePubs(): [
  Record<string, string[]>,
  React.Dispatch<React.SetStateAction<Record<string, string[]>>>
] {
  const { pubs, setPubs } = React.useContext(PubsContext);

  return [pubs, setPubs];
}

export function useCurrentAuthor(): [
  AuthorKeypair | null,
  React.Dispatch<React.SetStateAction<AuthorKeypair | null>>
] {
  const { currentAuthor, setCurrentAuthor } = React.useContext(
    CurrentAuthorContext
  );

  return [currentAuthor, setCurrentAuthor];
}

export function useSync() {
  const [storages] = useStorages();
  const [pubs] = usePubs();

  return React.useCallback(
    (address: string) => {
      return new Promise((resolve, reject) => {
        const storage = storages[address];

        if (!storage) {
          reject(new Error('Workspace not found'));
        }

        const workspacePubs = pubs[address];

        if (!workspacePubs) {
          reject(new Error('No pubs found for workspace'));
        }

        Promise.all(
          workspacePubs.map(pubUrl => syncLocalAndHttp(storage, pubUrl))
        ).finally(resolve);
      });
    },
    [pubs, storages]
  );
}

export function usePaths(workspaceAddress: string, query: QueryOpts) {
  const [storages] = useStorages();

  const storage = storages[workspaceAddress];

  if (!storage) {
    console.warn(`Couldn't find workspace with address ${workspaceAddress}`);
  }

  const paths = storage ? storage.paths(query) : [];

  const [localPaths, setLocalPaths] = React.useState(paths);

  useSubscribeToStorages({
    workspaces: [workspaceAddress],
    includeHistory: query.includeHistory,
    onWrite: event => {
      if (!storage) {
        return;
      }

      if (
        query.pathPrefix &&
        !event.document.path.startsWith(query.pathPrefix)
      ) {
        return;
      }

      if (query.lowPath && query.lowPath <= event.document.path === false) {
        return;
      }

      if (query.highPath && event.document.path < query.highPath === false) {
        return;
      }

      if (query.contentIsEmpty && event.document.content !== '') {
        return;
      }

      if (query.contentIsEmpty === false && event.document.content === '') {
        return;
      }

      setLocalPaths(storage.paths(query));
    },
  });

  return localPaths;
}

export function useDocument(
  workspaceAddress: string,
  path: string
): [
  Document | undefined,
  (
    content: string,
    deleteAfter?: number | null | undefined
  ) => WriteResult | ValidationError,
  () => void
] {
  const [storages] = useStorages();
  const [currentAuthor] = useCurrentAuthor();

  const storage = storages[workspaceAddress];

  const document = storage ? storage.getDocument(path) : undefined;

  const [localDocument, setLocalDocument] = React.useState(document);

  useSubscribeToStorages({
    workspaces: [workspaceAddress],
    paths: [path],
    onWrite: event => setLocalDocument(event.document),
  });

  const set = React.useCallback(
    (content: string, deleteAfter?: number | null | undefined) => {
      if (!storage) {
        return new ValidationError(
          `useDocument couldn't get the workspace ${workspaceAddress}`
        );
      }

      if (!currentAuthor) {
        console.warn('Tried to set a document when no current author was set.');
        return new ValidationError(
          'Tried to set a document when no current author was set.'
        );
      }

      const docToSet: DocToSet = {
        format: 'es.4',
        path,
        content,
        deleteAfter,
      };

      return storage.set(currentAuthor, docToSet);
    },
    [path, currentAuthor, storage, workspaceAddress]
  );

  const deleteDoc = () => {
    set('');
  };

  return [localDocument, set, deleteDoc];
}

export function useStorages(): [
  Record<string, IStorage>,
  React.Dispatch<React.SetStateAction<Record<string, IStorage>>>
] {
  const { storages, setStorages } = React.useContext(StorageContext);

  return [storages, setStorages];
}

export function useSubscribeToStorages(options: {
  workspaces?: string[];
  paths?: string[];
  includeHistory?: boolean;
  onWrite: (event: WriteEvent) => void;
}) {
  const [storages] = useStorages();

  React.useEffect(() => {
    const onWrite = (event: WriteEvent) => {
      if (!event.isLatest && !options.includeHistory) {
        return;
      }

      options.onWrite(event);
    };

    const unsubscribes = Object.values(storages)
      .filter(storage => {
        if (options.workspaces) {
          return options.workspaces.includes(storage.workspace);
        }

        return true;
      })
      .map(storage => {
        return storage.onWrite.subscribe(event => {
          if (options.paths) {
            if (options.paths.includes(event.document.path)) {
              onWrite(event);
            }
            return;
          }

          onWrite(event);
        });
      });

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [options, storages]);
}

export function useIsLive(): [
  boolean,
  React.Dispatch<React.SetStateAction<boolean>>
] {
  const { isLive, setIsLive } = React.useContext(IsLiveContext);

  return [isLive, setIsLive];
}
