import React, { useState } from 'react';
import type { Book, ReadingStatus, Shelf } from '../../db/types';
import { Modal } from '../../shared/ui/overlays';
import { Button, Segmented } from '../../shared/ui/controls';
import { useI18n } from '../../i18n';
import { db } from '../../db/database';

/** Модалка редактирования метаданных книги: название, автор, статус, теги, полка. */
export function BookDetailsModal({
  book,
  onClose,
  onSave,
  shelves,
}: {
  book: Book;
  onClose: () => void;
  onSave: (patch: Partial<Book>) => void;
  shelves: Shelf[];
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [status, setStatus] = useState<ReadingStatus>(book.status);
  const [tags, setTags] = useState(book.tags.join(', '));
  const [shelfIds, setShelfIds] = useState(book.shelfIds);
  const [coverName, setCoverName] = useState('');

  return (
    <Modal open onClose={onClose} title={t('library.editMeta')}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm text-muted">{t('common.title')}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full mt-1 px-4 py-3 rounded-2xl bg-surface border border-border text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted">{t('common.author')}</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder={t('library.fromMetadata')}
            className="w-full mt-1 px-4 py-3 rounded-2xl bg-surface border border-border text-sm"
          />
        </label>

        <div>
          <span className="text-sm text-muted">{t('library.statusLabel')}</span>
          <Segmented
            className="mt-1"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'want', label: t('library.filter.want') },
              { value: 'reading', label: t('library.filter.reading') },
              { value: 'read', label: t('library.filter.readed') },
            ]}
          />
        </div>

        <label className="block">
          <span className="text-sm text-muted">{t('library.tags')}</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="фантастика, классика…"
            className="w-full mt-1 px-4 py-3 rounded-2xl bg-surface border border-border text-sm"
          />
        </label>

        <div>
          <span className="text-sm text-muted">{t('library.shelves')}</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {shelves.length === 0 && <span className="text-sm text-muted">{t('library.noShelves')}</span>}
            {shelves.map((s) => (
              <button
                key={s.id}
                onClick={() =>
                  setShelfIds((prev) =>
                    prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                  )
                }
                className={`px-3 py-2 rounded-full text-sm border min-h-[40px] ${
                  shelfIds.includes(s.id)
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface border-border text-muted'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm text-muted">{t('library.cover')}</span>
          <input
            type="file"
            accept="image/*"
            className="block mt-1 text-sm text-muted file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-accent-soft file:text-accent"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setCoverName(f.name);
                const buf = await f.arrayBuffer();
                await db.books.update(book.id, { cover: new Blob([buf], { type: f.type }) });
              }
            }}
          />
          {coverName && <p className="text-xs text-muted mt-1">{coverName}</p>}
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            className="flex-1"
            onClick={() =>
              onSave({
                title: title.trim() || book.title,
                author: author.trim(),
                status,
                tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
                shelfIds,
              })
            }
          >
            {t('common.save')}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
