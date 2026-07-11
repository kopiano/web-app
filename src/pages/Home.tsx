import { Link } from 'react-router-dom';
import '@/styles/home.scss';

function Home() {
  return (
    <section className="home" id="home">
      <div className="background-wrapper">
        <div className="wrapper-images">
          <div className="wrapper-img bg-1"></div>
          <div className="wrapper-img bg-2"></div>
          <div className="wrapper-img bg-3"></div>
          <div className="wrapper-img bg-4"></div>
        </div>
        <div className="wrapper-blur"></div>
        <div className="wrapper-color"></div>
      </div>
    </section>
  );
}

export default Home;
