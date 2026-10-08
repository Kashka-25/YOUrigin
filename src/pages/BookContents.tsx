import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpenText } from 'lucide-react';
import { ContentsList, useBookOrder } from '../components/book/ContentsList';
import { EmptyState, Spinner } from '../components/ui';
import { useLibrary } from '../hooks/useLibrary';

/** Full-page contents for a book (the same list is collapsible in the builder and editor). */
export function BookContents() {
  const { id } = useParams();
  const lib = useLibrary();
  const order = useBookOrder(id);
  if (!lib) return <Spinner />;
  if (!order) return <EmptyState title="Book not found" action={<Link to="/books" className="btn">All books</Link>} />;
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 md:px-8 md:pt-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/books/${order.book.id}`} className="btn-ghost -ml-3">
          <ArrowLeft size={16} /> Builder
        </Link>
        <Link to={`/books/${order.book.id}/read`} className="btn-ghost ml-auto">
          <BookOpenText size={16} /> Read
        </Link>
      </div>
      <p className="eyebrow mt-3">Contents</p>
      <h1 className="page-title">{order.book.title}</h1>
      <p className="mt-1 mb-4 text-sm text-ink-2">{order.flat.length} pieces · tap a title to open it, then use Previous / Next to move through the book.</p>
      <ContentsList bookId={order.book.id} />
    </div>
  );
}
